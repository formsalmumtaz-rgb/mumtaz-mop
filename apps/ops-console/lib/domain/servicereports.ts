import "server-only";
import { pool } from "../db";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Service Report (mig 006 + 033). The report row is append-only (immutable once
// filed). Approval and attachments are separate append-only records — we never
// mutate the report. Numbering is SR/YY/NNNNN via fn_next_document_number.

export interface ServiceReportHeader {
  id: string;
  report_number: string | null;
  job_id: string;
  customer_id: string | null;
  customer: string | null;
  performed_by: string | null;
  performer: string | null;
  server_completed_at: string | null;
  review_action: string | null; // 'approved' | 'rejected' | null (pending)
  attachment_count: number;
}

export async function listServiceReports(tenantId: string): Promise<ServiceReportHeader[]> {
  const { rows } = await pool.query(
    `select sr.id, sr.report_number, sr.job_id, sr.customer_id, cu.trade_name as customer,
            sr.performed_by, t.full_name as performer, sr.server_completed_at::text,
            st.review_action,
            (select count(*)::int from service_report_attachments a where a.service_report_id = sr.id) as attachment_count
       from service_reports sr
       left join customers cu on cu.id = sr.customer_id
       left join technicians t on t.id = sr.performed_by
       left join service_report_status st on st.service_report_id = sr.id
      where sr.tenant_id = $1
      order by sr.server_completed_at desc`,
    [tenantId],
  );
  return rows as ServiceReportHeader[];
}

export interface ServiceReportReview { id: string; action: string; note: string | null; created_at: string; }
export interface ServiceReportAttachment { id: string; kind: string; storage_key: string; caption: string | null; created_at: string; }

export async function getServiceReport(tenantId: string, id: string): Promise<{
  header: ServiceReportHeader & { snapshot: Record<string, unknown> }; reviews: ServiceReportReview[]; attachments: ServiceReportAttachment[];
} | null> {
  const { rows } = await pool.query(
    `select sr.id, sr.report_number, sr.job_id, sr.customer_id, cu.trade_name as customer,
            sr.performed_by, t.full_name as performer, sr.server_completed_at::text, sr.snapshot,
            st.review_action,
            (select count(*)::int from service_report_attachments a where a.service_report_id = sr.id) as attachment_count
       from service_reports sr
       left join customers cu on cu.id = sr.customer_id
       left join technicians t on t.id = sr.performed_by
       left join service_report_status st on st.service_report_id = sr.id
      where sr.tenant_id = $1 and sr.id = $2`,
    [tenantId, id],
  );
  if (!rows[0]) return null;
  const { rows: reviews } = await pool.query(
    `select id, action, note, created_at::text from service_report_reviews where tenant_id=$1 and service_report_id=$2 order by created_at desc`,
    [tenantId, id],
  );
  const { rows: attachments } = await pool.query(
    `select id, kind, storage_key, caption, created_at::text from service_report_attachments where tenant_id=$1 and service_report_id=$2 order by created_at`,
    [tenantId, id],
  );
  return { header: rows[0], reviews: reviews as ServiceReportReview[], attachments: attachments as ServiceReportAttachment[] };
}

// Completed jobs that don't yet have a service report — the back-office capture queue.
export async function listCompletedJobsWithoutSR(tenantId: string): Promise<{ id: string; customer: string | null; scheduled_date: string | null }[]> {
  const { rows } = await pool.query(
    `select j.id, cu.trade_name as customer, j.scheduled_date::text
       from jobs j
       left join customers cu on cu.id = j.customer_id
      where j.tenant_id = $1 and j.status = 'completed'
        and not exists (select 1 from service_reports sr where sr.job_id = j.id and sr.tenant_id = $1)
      order by j.completed_at desc nulls last
      limit 100`,
    [tenantId],
  );
  return rows;
}

// File a service report for a completed job. Assigns SR/YY/NNNNN. The row is
// append-only; this is the immutable record of what was done.
export async function createServiceReport(tenantId: string, jobId: string, d: { performed_by?: string; notes?: string }): Promise<string> {
  const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into service_reports (tenant_id, service_line_id, job_id, customer_id, branch_id, report_number, performed_by, snapshot)
       select $1, j.service_line_id, j.id, j.customer_id, null, fn_next_document_number($1,'SR'), $3,
              jsonb_build_object('notes', $4::text, 'source', 'back_office', 'filed_at', now())
         from jobs j where j.id = $2 and j.tenant_id = $1
       returning id, report_number`,
      [tenantId, jobId, clean(d.performed_by), clean(d.notes)],
    );
    if (!rows[0]) throw new Error("Completed job not found");
    await audit(c, tenantId, { table: "service_reports", rowId: rows[0].id, action: "insert", newValue: { job_id: jobId, report_number: rows[0].report_number }, note: "service report filed" });
    return rows[0].id as string;
  });
}

export async function reviewServiceReport(tenantId: string, srId: string, action: "approved" | "rejected", note?: string): Promise<void> {
  if (action !== "approved" && action !== "rejected") throw new Error("Invalid review action");
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into service_report_reviews (tenant_id, service_report_id, action, note)
       select $1, $2, $3, $4 where exists (select 1 from service_reports where id=$2 and tenant_id=$1)
       returning id`,
      [tenantId, srId, action, (note ?? "").trim() || null],
    );
    if (!rows[0]) throw new Error("Service report not found");
    await audit(c, tenantId, { table: "service_report_reviews", rowId: rows[0].id, action: "insert", newValue: { service_report_id: srId, action }, note: `service report ${action}` });
  });
}

export async function addServiceReportAttachment(tenantId: string, srId: string, d: { kind: string; storage_key: string; caption?: string }): Promise<void> {
  if (!["photo", "signature", "document"].includes(d.kind)) throw new Error("Invalid attachment kind");
  if (!d.storage_key?.trim()) throw new Error("Storage key required");
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into service_report_attachments (tenant_id, service_report_id, kind, storage_key, caption)
       select $1, $2, $3, $4, $5 where exists (select 1 from service_reports where id=$2 and tenant_id=$1)
       returning id`,
      [tenantId, srId, d.kind, d.storage_key.trim(), (d.caption ?? "").trim() || null],
    );
    if (!rows[0]) throw new Error("Service report not found");
    await audit(c, tenantId, { table: "service_report_attachments", rowId: rows[0].id, action: "insert", newValue: d, note: "service report attachment added" });
  });
}
