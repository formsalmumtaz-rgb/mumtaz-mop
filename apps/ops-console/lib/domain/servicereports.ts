import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Service Report (mig 006 + 033). The report row is append-only (immutable once
// filed). Approval and attachments are separate append-only records — we never
// mutate the report. Numbering is SR/YY/NNNNN via fn_next_document_number.

export interface ServiceReportHeader {
  customer_code: string | null;
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
    `select sr.id, sr.report_number, sr.job_id, sr.customer_id, cu.trade_name as customer, cu.code as customer_code,
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

// ── Vision Part 1: the FULL service report document (template question set) ──
// Everything AlMumtaz_ServiceReport_v2 needs, assembled from data the system
// already holds — PREPOPULATION IS THE POINT (S1–S3 arrive filled from the job,
// contract, customer and assignment). Anything absent is omitted, never blank.
export interface ServiceReportDocument {
  // S1 — job reference & identification
  report_number: string | null;
  date: string | null;
  time_in: string | null;
  time_out: string | null;
  job_ref: string;
  contract_number: string | null;
  invoice_number: string | null;
  visit_seq: number | null;      // visit N…
  visit_total: number | null;    // …of TOTAL scheduled on the contract
  service_order_type: string | null;   // scheduled / emergency / follow_up / warranty_visit
  service_category: string | null;     // Residential (B2C) / Commercial (B2B) / Industrial
  contract_type: string | null;        // AMC / One-Time / Quarterly / Monthly
  service_line_code: string | null;
  service_line_name: string | null;
  // S2 — customer details
  customer: {
    trade_name: string | null; legal_name: string | null; alias: string | null;
    account_number: string | null; trn: string | null;
    group_name: string | null;         // chain / group
    branch_name: string | null; address: string | null;
    emirate: string | null; po_box: string | null;
    contact_name: string | null; contact_phone: string | null;
    contact_secondary: string | null; email: string | null;
    rep_name: string | null; rep_designation: string | null; rep_contact: string | null;
  };
  // S3 — service team
  supervisor: { name: string; code: string | null; phone: string | null } | null;
  team: { name: string; code: string | null }[];
  // S4/S5/S6
  premises_type: string | null;
  pest_evidence: string[];             // issue labels observed this visit
  infestation_level: string | null;    // worst level this visit
  areas_treated: string[];             // area labels this visit
  specific_areas_detail: string | null;
  access_restrictions: string | null;
  // S7 — chemicals & treatment
  treatment_method: string | null;
  chemicals: { product: string; active_ingredient: string | null; concentration: string | null; batch_no: string | null; quantity: number; unit: string | null; dilution: string | null; application_method: string | null; target_pest: string | null }[];
  ppe_used: string | null;
  // S8/S9
  findings: { area: string; issue: string | null; infestation: string | null; hygiene: number | null; structural: number | null; notes: string | null }[];
  recommendations: string | null;
  trend: { visit_label: string; date: string | null; infestation: number | null; hygiene: number | null; structural: number | null }[];
  most_flagged_issue: string | null;
  notes: string;
  // S11 — contract, guarantee & financials
  financials: {
    months_guaranteed: number | null;
    yearly_contract: boolean | null;
    next_service_due: string | null;
    amount_excl_vat: number | null;
    vat_amount: number | null;
    total_incl_vat: number | null;
    amount_received: number | null;
    payment_method: string | null;
    balance_due: number | null;
  };
  // S12 — PNG bytes from R2. `*_captured` distinguishes a signature that EXISTS
  // but can't be rendered (webp-era capture) from one never taken.
  signatures: { customer: Buffer | null; customer_captured: boolean; technician: Buffer | null; technician_captured: boolean };
}

export async function getServiceReportDocument(tenantId: string, id: string): Promise<ServiceReportDocument | null> {
  const { rows } = await scopedRead(tenantId,
    `select sr.report_number, sr.server_completed_at::text as date, sr.job_id, sr.snapshot,
            sl.code as service_line_code, sl.name as service_line_name,
            j.contract_id, ct.contract_number, j.attributes as job_attrs, j.team_id,
            ct.billing_frequency,
            f.name as frequency_name, f.period_unit as freq_unit, f.period_count as freq_count,
            to_char(coalesce(j.device_started_at, j.started_at), 'HH24:MI') as time_in,
            to_char(coalesce(j.device_completed_at, j.completed_at), 'HH24:MI') as time_out,
            coalesce(j.scheduled_date::text, sr.server_completed_at::date::text) as service_date,
            cu.trade_name, cu.legal_name, cu.attributes->>'alias_name' as alias,
            cu.attributes->>'po_box' as po_box, cu.code as account_number, cu.trn,
            cu.customer_type, cu.emirate as cu_emirate,
            g.name as group_name,
            b.name as branch_name, b.address, b.emirate as br_emirate, ft.name as premises_type,
            (select k.name from contacts k where k.customer_id = cu.id and k.is_primary limit 1) as contact_name,
            (select k.phone from contacts k where k.customer_id = cu.id and k.is_primary limit 1) as contact_phone,
            (select k.phone from contacts k where k.customer_id = cu.id and not k.is_primary and k.phone is not null limit 1) as contact_secondary,
            (select k.email from contacts k where k.customer_id = cu.id and k.email is not null order by k.is_primary desc limit 1) as email,
            (select cs.visit_seq from contract_schedule cs
              where cs.contract_id = j.contract_id and cs.scheduled_date = j.scheduled_date limit 1) as visit_seq,
            (select count(*)::int from contract_schedule cs where cs.contract_id = j.contract_id) as visit_total,
            (select min(cs.scheduled_date)::text from contract_schedule cs
              where cs.contract_id = j.contract_id and cs.scheduled_date > j.scheduled_date) as next_service_due,
            inv.invoice_number, inv.subtotal::float8 as amount_excl_vat, inv.vat_total::float8 as vat_amount,
            inv.total::float8 as total_incl_vat, inv.id as invoice_id
       from service_reports sr
       join jobs j on j.id = sr.job_id
       left join contracts ct on ct.id = j.contract_id
       left join frequencies f on f.id = ct.frequency_id
       left join customers cu on cu.id = sr.customer_id
       left join customer_groups g on g.id = cu.group_id
       left join customer_branches b on b.id = j.branch_id
       left join facility_types ft on ft.id = b.facility_type_id
       left join service_lines sl on sl.id = sr.service_line_id
       left join lateral (select i.id, i.invoice_number, i.subtotal, i.vat_total, i.total
                            from invoices i where i.job_id = j.id order by i.created_at desc limit 1) inv on true
      where sr.tenant_id = $1 and sr.id = $2`, [tenantId, id]);
  const h = rows[0];
  if (!h) return null;

  const [team, chems, findings, trend, sigs, guaranteeRow, receiptsRow] = await Promise.all([
    scopedRead(tenantId,
      `select coalesce(t.full_name, t.code, 'Technician') as name, t.code, t.phone, t.is_team_lead
         from job_assignments ja join technicians t on t.id = ja.technician_id
        where ja.job_id = $2 and t.tenant_id = $1
        order by t.is_team_lead desc, t.full_name`, [tenantId, h.job_id]).then((r) => r.rows),
    scopedRead(tenantId,
      `select it.name as product, it.active_ingredient, it.concentration,
              ib.batch_no, sm.quantity::float8 as quantity, u.code as unit,
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
                   when 'medium' then 2 when 'high' then 3 when 'severe' then 4 when 'critical' then 4 end)::int as infestation,
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
    scopedRead(tenantId,
      `select case when value #>> '{}' ~ '^-?[0-9]+\\.?[0-9]*$' then (value #>> '{}')::numeric end as v
         from settings where tenant_id = $1 and key = 'service.guarantee_months_default'
        order by service_line_id nulls last limit 1`, [tenantId]).then((r) => r.rows),
    // S11 amount received: allocations against this job's invoice (append-only truth)
    h.invoice_id
      ? scopedRead(tenantId,
          `select coalesce(sum(ra.amount),0)::float8 as received,
                  (select r2.method from receipt_allocations ra2 join receipts r2 on r2.id = ra2.receipt_id
                    where ra2.invoice_id = $2 order by r2.created_at desc limit 1) as method
             from receipt_allocations ra where ra.tenant_id = $1 and ra.invoice_id = $2`,
          [tenantId, h.invoice_id]).then((r) => r.rows)
      : Promise.resolve([{ received: null, method: null }]),
  ]);

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

  const { rows: flag } = await scopedRead(tenantId,
    `select ji.issue_type, count(*)::int n
       from jobs j join job_inspections ji on ji.job_id = j.id
      where j.tenant_id = $1 and j.customer_id = (select customer_id from service_reports where id = $2)
        and ji.issue_type is not null
      group by ji.issue_type order by n desc limit 1`, [tenantId, id]);

  const snapshot = (h.snapshot ?? {}) as Record<string, unknown>;
  const attrs = (h.job_attrs ?? {}) as Record<string, string>;
  const teamRows = team as { name: string; code: string | null; phone: string | null; is_team_lead: boolean }[];
  const supervisor = teamRows.find((t) => t.is_team_lead) ?? null;

  // S1 derived classifications — from data, never guessed:
  const orderType = attrs.service_order_type ?? "scheduled";
  const serviceCategory =
    h.customer_type === "B2C" ? "Residential (B2C)"
    : h.customer_type === "B2B" || h.customer_type === "B2G" ? "Commercial (B2B)"
    : null;
  // Contract type: AMC when a yearly frequency-driven contract exists; else by billing cadence.
  const contractType = !h.contract_id ? "One-Time"
    : h.billing_frequency === "monthly" ? "Monthly"
    : h.billing_frequency === "quarterly" ? "Quarterly"
    : "AMC";

  const distinct = (xs: (string | null)[]): string[] => [...new Set(xs.filter((x): x is string => !!x))];
  const findingRows = findings as ServiceReportDocument["findings"];
  const rank: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, severe: 4, critical: 4 };
  const worst = findingRows.reduce<string | null>((acc, f) =>
    f.infestation && (acc == null || (rank[f.infestation] ?? 0) > (rank[acc] ?? 0)) ? f.infestation : acc, null);

  const guaranteeMonths = guaranteeRow[0]?.v != null && Number(guaranteeRow[0].v) > 0 ? Number(guaranteeRow[0].v) : null;
  const received = receiptsRow[0]?.received != null ? Number(receiptsRow[0].received) : null;

  return {
    report_number: h.report_number, date: h.service_date,
    time_in: h.time_in, time_out: h.time_out,
    job_ref: String(h.job_id).slice(0, 8).toUpperCase(),
    contract_number: h.contract_number,
    invoice_number: h.invoice_number ?? null,
    visit_seq: h.visit_seq != null ? Number(h.visit_seq) : null,
    visit_total: h.visit_total ? Number(h.visit_total) : null,
    service_order_type: orderType,
    service_category: serviceCategory,
    contract_type: contractType,
    service_line_code: h.service_line_code, service_line_name: h.service_line_name,
    customer: {
      trade_name: h.trade_name, legal_name: h.legal_name, alias: h.alias,
      account_number: h.account_number, trn: h.trn,
      group_name: h.group_name,
      branch_name: h.branch_name, address: h.address,
      emirate: h.br_emirate ?? h.cu_emirate, po_box: h.po_box,
      contact_name: h.contact_name, contact_phone: h.contact_phone,
      contact_secondary: h.contact_secondary, email: h.email,
      rep_name: attrs.onsite_rep_name ?? null,
      rep_designation: attrs.onsite_rep_designation ?? null,
      rep_contact: attrs.onsite_rep_contact ?? null,
    },
    supervisor: supervisor ? { name: supervisor.name, code: supervisor.code, phone: supervisor.phone } : null,
    team: teamRows.filter((t) => !t.is_team_lead).map((t) => ({ name: t.name, code: t.code })),
    premises_type: h.premises_type,
    pest_evidence: distinct(findingRows.map((f) => f.issue)),
    infestation_level: worst,
    areas_treated: distinct(findingRows.map((f) => f.area)),
    specific_areas_detail: attrs.specific_areas_treated ?? null,
    access_restrictions: attrs.access_restrictions ?? null,
    treatment_method: attrs.treatment_method ?? null,
    chemicals: chems as ServiceReportDocument["chemicals"],
    ppe_used: attrs.ppe_used ?? null,
    findings: findingRows,
    recommendations: attrs.recommendations ?? null,
    trend: trend as ServiceReportDocument["trend"],
    most_flagged_issue: (flag[0]?.issue_type as string) ?? null,
    notes: typeof snapshot.notes === "string" ? snapshot.notes : "",
    financials: {
      months_guaranteed: guaranteeMonths,
      yearly_contract: h.contract_id ? h.freq_unit != null || h.billing_frequency === "yearly" : null,
      next_service_due: h.next_service_due ?? null,
      amount_excl_vat: h.amount_excl_vat != null ? Number(h.amount_excl_vat) : null,
      vat_amount: h.vat_amount != null ? Number(h.vat_amount) : null,
      total_incl_vat: h.total_incl_vat != null ? Number(h.total_incl_vat) : null,
      amount_received: received,
      payment_method: (receiptsRow[0]?.method as string) ?? null,
      balance_due: h.total_incl_vat != null ? Math.round((Number(h.total_incl_vat) - (received ?? 0)) * 100) / 100 : null,
    },
    signatures: {
      customer: sigCustomer,
      customer_captured: (sigs as { signer: string }[]).some((s) => s.signer === "customer"),
      technician: sigTechnician,
      technician_captured: (sigs as { signer: string }[]).some((s) => s.signer === "technician"),
    },
  };
}
