import "server-only";
import { scopedRead } from "../rls";
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
  const { rows } = await scopedRead(tenantId, 
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
  header: ServiceReportHeader & { snapshot: Record<string, unknown>; service_line_code: string | null; service_line_name: string | null };
  reviews: ServiceReportReview[]; attachments: ServiceReportAttachment[];
} | null> {
  const { rows } = await scopedRead(tenantId,
    `select sr.id, sr.report_number, sr.job_id, sr.customer_id, cu.trade_name as customer,
            sr.performed_by, t.full_name as performer, sr.server_completed_at::text, sr.snapshot,
            sl.code as service_line_code, sl.name as service_line_name,
            st.review_action,
            (select count(*)::int from service_report_attachments a where a.service_report_id = sr.id) as attachment_count
       from service_reports sr
       left join customers cu on cu.id = sr.customer_id
       left join technicians t on t.id = sr.performed_by
       left join service_lines sl on sl.id = sr.service_line_id
       left join service_report_status st on st.service_report_id = sr.id
      where sr.tenant_id = $1 and sr.id = $2`,
    [tenantId, id],
  );
  if (!rows[0]) return null;
  const { rows: reviews } = await scopedRead(tenantId, 
    `select id, action, note, created_at::text from service_report_reviews where tenant_id=$1 and service_report_id=$2 order by created_at desc`,
    [tenantId, id],
  );
  const { rows: attachments } = await scopedRead(tenantId, 
    `select id, kind, storage_key, caption, created_at::text from service_report_attachments where tenant_id=$1 and service_report_id=$2 order by created_at`,
    [tenantId, id],
  );
  return { header: rows[0], reviews: reviews as ServiceReportReview[], attachments: attachments as ServiceReportAttachment[] };
}

// Completed jobs that don't yet have a service report — the back-office capture queue.
export async function listCompletedJobsWithoutSR(tenantId: string): Promise<{ id: string; customer: string | null; scheduled_date: string | null }[]> {
  const { rows } = await scopedRead(tenantId, 
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

// ── Part 5 (item 21): the FULL office service report document ────────────────
// Everything the two-page structure needs, assembled from data the system
// already holds — nothing re-asked, anything absent simply omitted (the
// renderer never prints an empty labelled box).
export interface ServiceReportDocument {
  report_number: string | null;
  date: string | null;
  time_in: string | null;
  time_out: string | null;
  job_ref: string;
  contract_number: string | null;
  visit_seq: number | null;      // visit N…
  visit_total: number | null;    // …of TOTAL scheduled on the contract
  service_line_code: string | null;
  service_line_name: string | null;
  customer: {
    trade_name: string | null; legal_name: string | null; alias: string | null;
    account_number: string | null; trn: string | null;
    branch_name: string | null; address: string | null;
    contact_name: string | null; contact_phone: string | null;
  };
  team: { name: string; code: string | null }[];
  premises_type: string | null;
  chemicals: { product: string; batch_no: string | null; quantity: number; unit: string | null; dilution: string | null }[];
  findings: { area: string; issue: string | null; infestation: string | null; hygiene: number | null; structural: number | null; notes: string | null }[];
  trend: { visit_label: string; date: string | null; infestation: number | null; hygiene: number | null; structural: number | null }[];
  most_flagged_issue: string | null;
  notes: string;
  // PNG bytes from R2. `*_captured` distinguishes a signature that EXISTS but
  // can't be rendered (webp-era capture) from one never taken — the renderer
  // only prints "signed on device — image unavailable" for the former.
  signatures: { customer: Buffer | null; customer_captured: boolean; technician: Buffer | null; technician_captured: boolean };
}

export async function getServiceReportDocument(tenantId: string, id: string): Promise<ServiceReportDocument | null> {
  const { rows } = await scopedRead(tenantId,
    `select sr.report_number, sr.server_completed_at::text as date, sr.job_id, sr.snapshot,
            sl.code as service_line_code, sl.name as service_line_name,
            j.contract_id, ct.contract_number,
            to_char(coalesce(j.device_started_at, j.started_at), 'HH24:MI') as time_in,
            to_char(coalesce(j.device_completed_at, j.completed_at), 'HH24:MI') as time_out,
            coalesce(j.scheduled_date::text, sr.server_completed_at::date::text) as service_date,
            cu.trade_name, cu.legal_name, cu.attributes->>'alias_name' as alias, cu.code as account_number, cu.trn,
            b.name as branch_name, b.address, ft.name as premises_type,
            (select k.name from contacts k where k.customer_id = cu.id and k.is_primary limit 1) as contact_name,
            (select k.phone from contacts k where k.customer_id = cu.id and k.is_primary limit 1) as contact_phone,
            (select cs.visit_seq from contract_schedule cs
              where cs.contract_id = j.contract_id and cs.scheduled_date = j.scheduled_date limit 1) as visit_seq,
            (select count(*)::int from contract_schedule cs where cs.contract_id = j.contract_id) as visit_total
       from service_reports sr
       join jobs j on j.id = sr.job_id
       left join contracts ct on ct.id = j.contract_id
       left join customers cu on cu.id = sr.customer_id
       left join customer_branches b on b.id = j.branch_id
       left join facility_types ft on ft.id = b.facility_type_id
       left join service_lines sl on sl.id = sr.service_line_id
      where sr.tenant_id = $1 and sr.id = $2`, [tenantId, id]);
  const h = rows[0];
  if (!h) return null;

  const [team, chems, findings, trend, sigs] = await Promise.all([
    scopedRead(tenantId,
      `select coalesce(t.full_name, t.code, 'Technician') as name, t.code
         from job_assignments ja join technicians t on t.id = ja.technician_id
        where ja.job_id = $2 and t.tenant_id = $1`, [tenantId, h.job_id]).then((r) => r.rows),
    scopedRead(tenantId,
      `select it.name as product, ib.batch_no, sm.quantity::float8 as quantity, u.code as unit,
              rv.dilution_ratio as dilution
         from stock_movements sm
         join items it on it.id = sm.item_id
         left join item_batches ib on ib.id = sm.batch_id
         left join units u on u.id = sm.unit_id
         left join treatment_recipe_versions rv on rv.id = sm.recipe_version_id
        where sm.tenant_id = $1 and sm.job_id = $2 and sm.movement_type = 'consumption'`,
      [tenantId, h.job_id]).then((r) => r.rows),
    scopedRead(tenantId,
      `select area, issue_type as issue, infestation_level as infestation,
              hygiene_score::int as hygiene, structural_score::int as structural, notes
         from job_inspections where tenant_id = $1 and job_id = $2 order by created_at`,
      [tenantId, h.job_id]).then((r) => r.rows),
    scopedRead(tenantId,
      `select 'V' || row_number() over (order by j.scheduled_date) as visit_label,
              j.scheduled_date::text as date,
              max(case ji.infestation_level when 'none' then 0 when 'low' then 1
                   when 'medium' then 2 when 'high' then 3 when 'severe' then 4 end)::int as infestation,
              round(avg(ji.hygiene_score))::int as hygiene,
              round(avg(ji.structural_score))::int as structural
         from jobs j join job_inspections ji on ji.job_id = j.id
        where j.tenant_id = $1 and j.customer_id = (select customer_id from service_reports where id = $2)
          and j.status = 'completed'
        group by j.id, j.scheduled_date
        order by j.scheduled_date desc limit 4`, [tenantId, id]).then((r) => r.rows.reverse()),
    scopedRead(tenantId,
      `select signer, storage_key from job_signatures
        where tenant_id = $1 and job_id = $2 order by created_at desc`, [tenantId, h.job_id]).then((r) => r.rows),
  ]);

  // Signatures: fetch PNGs from R2 (webp-era captures can't be decoded
  // server-side — skipped, the renderer omits the image, never fakes one).
  const sigBytes = async (signer: string): Promise<Buffer | null> => {
    const row = (sigs as { signer: string; storage_key: string }[]).find((s) => s.signer === signer && s.storage_key.endsWith(".png"));
    if (!row) return null;
    try {
      const { getObjectBytes, r2Configured } = await import("../storage/r2");
      if (!r2Configured()) return null;
      return await getObjectBytes(row.storage_key);
    } catch { return null; }
  };
  const [sigCustomer, sigTechnician] = await Promise.all([sigBytes("customer"), sigBytes("technician")]);

  // Most-flagged issue across the trend window
  const { rows: flag } = await scopedRead(tenantId,
    `select ji.issue_type, count(*)::int n
       from jobs j join job_inspections ji on ji.job_id = j.id
      where j.tenant_id = $1 and j.customer_id = (select customer_id from service_reports where id = $2)
        and ji.issue_type is not null
      group by ji.issue_type order by n desc limit 1`, [tenantId, id]);

  const snapshot = (h.snapshot ?? {}) as Record<string, unknown>;
  return {
    report_number: h.report_number, date: h.service_date,
    time_in: h.time_in, time_out: h.time_out,
    job_ref: String(h.job_id).slice(0, 8).toUpperCase(),
    contract_number: h.contract_number,
    visit_seq: h.visit_seq != null ? Number(h.visit_seq) : null,
    visit_total: h.visit_total ? Number(h.visit_total) : null,
    service_line_code: h.service_line_code, service_line_name: h.service_line_name,
    customer: {
      trade_name: h.trade_name, legal_name: h.legal_name, alias: h.alias,
      account_number: h.account_number, trn: h.trn,
      branch_name: h.branch_name, address: h.address,
      contact_name: h.contact_name, contact_phone: h.contact_phone,
    },
    team: team as { name: string; code: string | null }[],
    premises_type: h.premises_type,
    chemicals: chems as ServiceReportDocument["chemicals"],
    findings: findings as ServiceReportDocument["findings"],
    trend: trend as ServiceReportDocument["trend"],
    most_flagged_issue: (flag[0]?.issue_type as string) ?? null,
    notes: typeof snapshot.notes === "string" ? snapshot.notes : "",
    signatures: {
      customer: sigCustomer,
      customer_captured: (sigs as { signer: string }[]).some((s) => s.signer === "customer"),
      technician: sigTechnician,
      technician_captured: (sigs as { signer: string }[]).some((s) => s.signer === "technician"),
    },
  };
}
