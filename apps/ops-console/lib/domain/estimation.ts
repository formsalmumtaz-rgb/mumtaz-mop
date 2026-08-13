import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Estimation Engine (mig 029). Revenue via fn_price (028); cost via fn_estimate_cost
// (standard rates, operating basis — no depreciation). Deterministic profit preview.

export interface EstimateHeader {
  id: string;
  estimate_number: string | null;
  customer_id: string | null;
  customer: string | null;
  status: string;
  property_type: string | null;
  engagement_type: string | null;
  valid_until: string | null;
  revenue: number;
  est_cost: number;
  gross_profit: number;
  line_count: number;
  contract_id?: string | null;
}

export async function listEstimates(tenantId: string): Promise<EstimateHeader[]> {
  const { rows } = await scopedRead(tenantId, 
    `select e.id, e.estimate_number, e.customer_id, cu.trade_name as customer, e.status,
            e.property_type, e.engagement_type, e.valid_until::text,
            p.revenue::float8, p.est_cost::float8, p.gross_profit::float8, p.line_count
       from estimates e
       left join customers cu on cu.id = e.customer_id
       left join estimate_profitability p on p.estimate_id = e.id
      where e.tenant_id = $1
      order by e.created_at desc`,
    [tenantId],
  );
  return rows as EstimateHeader[];
}

export async function listEstimatesForCustomer(tenantId: string, customerId: string): Promise<EstimateHeader[]> {
  const { rows } = await scopedRead(tenantId, 
    `select e.id, e.estimate_number, e.customer_id, cu.trade_name as customer, e.status,
            e.property_type, e.engagement_type, e.valid_until::text, e.contract_id,
            p.revenue::float8, p.est_cost::float8, p.gross_profit::float8, p.line_count
       from estimates e
       left join customers cu on cu.id = e.customer_id
       left join estimate_profitability p on p.estimate_id = e.id
      where e.tenant_id = $1 and e.customer_id = $2
      order by e.created_at desc`,
    [tenantId, customerId],
  );
  return rows as EstimateHeader[];
}

export interface EstimateLine {
  id: string;
  service_type_id: string | null;
  service_name: string | null;
  pricing_model_id: string | null;
  model_name: string | null;
  model_type: string | null;
  description: string | null;
  unit_price: number;
  measure: number;
  measures: Record<string, number>;
  line_total: number;
  est_labour_hours: number;
  est_distance_km: number;
  est_material_cost: number;
  est_cost: number;
}

export async function getEstimate(tenantId: string, id: string): Promise<{ header: EstimateHeader; lines: EstimateLine[] } | null> {
  const { rows: hdr } = await scopedRead(tenantId, 
    `select e.id, e.estimate_number, e.customer_id, cu.trade_name as customer, e.status,
            e.property_type, e.engagement_type, e.valid_until::text, e.contract_id,
            p.revenue::float8, p.est_cost::float8, p.gross_profit::float8, p.line_count
       from estimates e left join customers cu on cu.id=e.customer_id
       left join estimate_profitability p on p.estimate_id=e.id
      where e.tenant_id=$1 and e.id=$2`,
    [tenantId, id],
  );
  if (!hdr[0]) return null;
  const { rows: lines } = await scopedRead(tenantId, 
    `select l.id, l.service_type_id, st.name as service_name, l.pricing_model_id, pm.name as model_name, pm.model_type,
            l.description, l.unit_price::float8, l.measure::float8, l.measures,
            l.line_total::float8, l.est_labour_hours::float8, l.est_distance_km::float8, l.est_material_cost::float8, l.est_cost::float8
       from estimate_lines l
       left join service_types st on st.id=l.service_type_id
       left join pricing_models pm on pm.id=l.pricing_model_id
      where l.tenant_id=$1 and l.estimate_id=$2 order by l.seq nulls last, l.created_at`,
    [tenantId, id],
  );
  return { header: hdr[0] as EstimateHeader, lines: lines as EstimateLine[] };
}

export async function createEstimate(
  tenantId: string, serviceLineId: string,
  d: { customer_id?: string; branch_id?: string; property_type?: string; engagement_type?: string; valid_until?: string; notes?: string },
): Promise<string> {
  const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into estimates (tenant_id, service_line_id, customer_id, branch_id, property_type, engagement_type, valid_until, notes, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'draft') returning id`,
      [tenantId, serviceLineId, clean(d.customer_id), clean(d.branch_id), clean(d.property_type), clean(d.engagement_type), clean(d.valid_until), clean(d.notes)],
    );
    await audit(c, tenantId, { table: "estimates", rowId: rows[0].id, action: "insert", newValue: d, note: "estimate created" });
    return rows[0].id as string;
  });
}

const num = (v: string | undefined, label: string): number => {
  const t = (v ?? "").trim();
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be ≥ 0`);
  return n;
};

export interface LineInput {
  service_type_id?: string; pricing_model_id?: string; description?: string;
  unit_price?: string; measure?: string; measures?: Record<string, number>;
  est_labour_hours?: string; est_distance_km?: string; est_material_cost?: string;
}

// Add a line: revenue and cost computed in-DB by fn_price / fn_estimate_cost so
// they are identical to every other price/cost calculation.
export async function addEstimateLine(tenantId: string, serviceLineId: string, estimateId: string, d: LineInput): Promise<void> {
  if (!d.pricing_model_id) throw new Error("Pricing model is required");
  await withTenantTx(tenantId, async (c) => {
    const owns = await c.query(`select status from estimates where id=$1 and tenant_id=$2`, [estimateId, tenantId]);
    if (!owns.rowCount) throw new Error("Estimate not found");
    if (owns.rows[0].status !== "draft") throw new Error("Only draft estimates can be edited");
    const hours = num(d.est_labour_hours, "Labour hours"), km = num(d.est_distance_km, "Distance"), mat = num(d.est_material_cost, "Material");
    const up = num(d.unit_price, "Unit price"), meas = num(d.measure, "Measure");
    const { rows } = await c.query(
      `insert into estimate_lines
         (tenant_id, estimate_id, service_type_id, pricing_model_id, description, unit_price, measure, measures,
          line_total, est_labour_hours, est_distance_km, est_material_cost, est_cost)
       select $1,$2,$3,$4,$5,$6,$7,$8::jsonb,
              fn_price(pm.model_type, $6, $7, pm.formula_spec, $8::jsonb),
              $9,$10,$11, fn_estimate_cost($1,$12,$9,$10,$11)
         from pricing_models pm where pm.id=$4 and pm.tenant_id=$1
       returning id, line_total::float8, est_cost::float8`,
      [tenantId, estimateId, d.service_type_id?.trim() || null, d.pricing_model_id, d.description?.trim() || null, up, meas,
       JSON.stringify(d.measures ?? {}), hours, km, mat, serviceLineId],
    );
    if (!rows[0]) throw new Error("Pricing model not found");
    await audit(c, tenantId, { table: "estimate_lines", rowId: rows[0].id, action: "insert", newValue: { ...d, line_total: rows[0].line_total, est_cost: rows[0].est_cost }, note: "estimate line added" });
  });
}

// Add an estimate line FROM a service category (Category Engine, mig 044). The
// category's deterministic assumptions become the line: person-hours = crew ×
// duration, material cost, and a pricing recommendation — all run through the
// SAME fn_price / fn_estimate_cost as a manual line, so nothing is special-cased
// or invented. Revenue comes from the category's pricing model (configure it as
// a fixed model with the recommended price to realise a flat quote).
export async function addEstimateLineFromCategory(
  tenantId: string, serviceLineId: string, estimateId: string, categoryId: string,
): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const est = await c.query(`select status from estimates where id=$1 and tenant_id=$2`, [estimateId, tenantId]);
    if (!est.rowCount) throw new Error("Estimate not found");
    if (est.rows[0].status !== "draft") throw new Error("Only draft estimates can be edited");
    const cat = (await c.query(
      `select name, service_type_id, default_pricing_model_id, default_unit_price::float8 as unit_price,
              default_measure::float8 as measure, crew_size, est_duration_hours::float8 as duration,
              -- prefer the deterministic BOM cost; fall back to the flat estimate when no BOM
              coalesce(nullif(fn_category_material_cost($2, id), 0), est_material_cost)::float8 as material
         from service_categories where id=$1 and tenant_id=$2 and is_active`, [categoryId, tenantId])).rows[0];
    if (!cat) throw new Error("Category not found or archived");
    if (!cat.default_pricing_model_id) throw new Error(`Category "${cat.name}" has no pricing model set — configure it under Service categories first.`);
    const hours = Number(cat.crew_size) * Number(cat.duration); // deterministic person-hours
    const { rows } = await c.query(
      `insert into estimate_lines
         (tenant_id, estimate_id, service_type_id, pricing_model_id, category_id, description, unit_price, measure, measures,
          line_total, est_labour_hours, est_distance_km, est_material_cost, est_cost)
       select $1,$2,$3,$4,$5,$6,$7,$8,'{}'::jsonb,
              fn_price(pm.model_type, $7, $8, pm.formula_spec, '{}'::jsonb),
              $9,0,$10, fn_estimate_cost($1,$11,$9,0,$10)
         from pricing_models pm where pm.id=$4 and pm.tenant_id=$1
       returning id, line_total::float8, est_cost::float8`,
      [tenantId, estimateId, cat.service_type_id, cat.default_pricing_model_id, categoryId,
       cat.name, cat.unit_price, cat.measure, hours, cat.material, serviceLineId],
    );
    if (!rows[0]) throw new Error("Pricing model not found");
    await audit(c, tenantId, {
      table: "estimate_lines", rowId: rows[0].id, action: "insert",
      newValue: { from_category: categoryId, category: cat.name, est_labour_hours: hours, line_total: rows[0].line_total, est_cost: rows[0].est_cost },
      note: `estimate line added from category "${cat.name}"`,
    });
  });
}

export async function deleteEstimateLine(tenantId: string, lineId: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(
      `delete from estimate_lines l using estimates e
        where l.id=$1 and l.tenant_id=$2 and e.id=l.estimate_id and e.status='draft' returning l.id`,
      [lineId, tenantId],
    );
    if (r.rowCount) await audit(c, tenantId, { table: "estimate_lines", rowId: lineId, action: "soft_delete", note: "estimate line removed" });
  });
}

// Convert an accepted estimate into a draft contract + contract_services (reusing
// the existing contract machinery; the user then activates it → K2 fans out
// schedule + jobs). Idempotent: refuses if already converted.
export async function convertEstimateToContract(tenantId: string, serviceLineId: string, estimateId: string): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    const e = (await c.query(
      `select customer_id, branch_id, status, contract_id, service_line_id from estimates where id=$1 and tenant_id=$2 for update`,
      [estimateId, tenantId])).rows[0];
    if (!e) throw new Error("Estimate not found");
    if (e.status !== "accepted") throw new Error("Only accepted estimates can be converted to a contract");
    if (e.contract_id) throw new Error("This estimate is already converted to a contract");
    if (!e.customer_id) throw new Error("Estimate needs a customer before it can become a contract");
    const sl = e.service_line_id ?? serviceLineId;
    const rev = (await c.query(`select coalesce(revenue,0) as r from estimate_profitability where estimate_id=$1`, [estimateId])).rows[0]?.r ?? 0;
    const contract = (await c.query(
      `insert into contracts(tenant_id, service_line_id, customer_id, contract_value, currency, lifecycle_status, start_date)
       values ($1,$2,$3,$4,'AED','draft', current_date) returning id`,
      [tenantId, sl, e.customer_id, rev])).rows[0];
    await c.query(
      `insert into contract_services(tenant_id, service_line_id, contract_id, branch_id, service_type_id, pricing_model_id, unit_price, quantity, notes)
       select $1, $2, $3, $4, l.service_type_id, l.pricing_model_id, l.unit_price, greatest(l.measure,1), nullif(l.description,'')
         from estimate_lines l where l.estimate_id=$5 and l.tenant_id=$1`,
      [tenantId, sl, contract.id, e.branch_id, estimateId]);
    await c.query(`update estimates set contract_id=$1 where id=$2`, [contract.id, estimateId]);
    await audit(c, tenantId, { table: "estimates", rowId: estimateId, action: "update", newValue: { contract_id: contract.id }, note: "estimate converted to contract" });
    await audit(c, tenantId, { table: "contracts", rowId: contract.id, action: "insert", newValue: { from_estimate: estimateId, contract_value: rev }, note: "contract created from accepted estimate" });
    return contract.id as string;
  });
}

export interface Quotation {
  quotation_number: string | null;
  status: string;
  quoted_at: string | null;
  valid_until: string | null;
  customer: string | null;
  customer_trn: string | null;
  service_line_code: string | null;
  service_line_name: string | null;
  lines: { description: string; amount: number }[];
  subtotal: number;
  vat_rate: number;
  vat: number;
  total: number;
}

// Customer-facing quotation view — REVENUE ONLY. Never returns cost/margin (retail
// mode by construction). Lines are frozen once the estimate is quoted.
export async function getQuotation(tenantId: string, id: string): Promise<Quotation | null> {
  const { rows: h } = await scopedRead(tenantId, 
    `select e.quotation_number, e.status, e.snapshot->>'quoted_at' as quoted_at, e.valid_until::text,
            cu.trade_name as customer, cu.trn as customer_trn,
            sl.code as service_line_code, sl.name as service_line_name
       from estimates e
       left join customers cu on cu.id=e.customer_id
       left join service_lines sl on sl.id=e.service_line_id
      where e.tenant_id=$1 and e.id=$2`, [tenantId, id]);
  if (!h[0]) return null;
  const { rows: lines } = await scopedRead(tenantId, 
    `select coalesce(nullif(l.description,''), st.name, 'Service') as description, l.line_total::float8 as amount
       from estimate_lines l left join service_types st on st.id=l.service_type_id
      where l.tenant_id=$1 and l.estimate_id=$2 order by l.seq nulls last, l.created_at`, [tenantId, id]);
  const { rows: vr } = await scopedRead(tenantId, 
    `select coalesce((value #>> '{}')::numeric, 5) as v from settings where tenant_id=$1 and key='vat_rate_percent' limit 1`, [tenantId]);
  const vat_rate = Number(vr[0]?.v ?? 5);
  const subtotal = lines.reduce((s: number, l: { amount: number }) => s + Number(l.amount), 0);
  const vat = Math.round(subtotal * vat_rate) / 100;
  return {
    quotation_number: h[0].quotation_number, status: h[0].status, quoted_at: h[0].quoted_at,
    valid_until: h[0].valid_until, customer: h[0].customer, customer_trn: h[0].customer_trn,
    service_line_code: h[0].service_line_code, service_line_name: h[0].service_line_name,
    lines: lines as { description: string; amount: number }[],
    subtotal, vat_rate, vat, total: subtotal + vat,
  };
}

const STATUSES: Record<string, string[]> = {
  draft: ["quoted"], quoted: ["accepted", "rejected", "expired", "draft"], accepted: [], rejected: ["draft"], expired: ["draft"],
};

export async function setEstimateStatus(tenantId: string, id: string, status: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const cur = (await c.query(`select status from estimates where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!cur) throw new Error("Estimate not found");
    if (!(STATUSES[cur.status] ?? []).includes(status)) throw new Error(`Cannot move from ${cur.status} to ${status}`);
    if (status === "quoted") {
      // Freeze a snapshot of the quoted lines (immutable record of what was quoted)
      // and assign a stable customer-facing quotation number (kept on re-quote).
      const s = await c.query(
        `select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at),'[]'::jsonb) as lines,
                (select to_jsonb(p) from estimate_profitability p where p.estimate_id=$1) as totals
           from estimate_lines l where l.estimate_id=$1`, [id]);
      const snap = JSON.stringify({ quoted_at: new Date().toISOString(), lines: s.rows[0].lines, totals: s.rows[0].totals });
      await c.query(
        `update estimates set status='quoted', snapshot=$2::jsonb,
                quotation_number = coalesce(quotation_number, 'Q-'||to_char(now(),'YYYYMM')||'-'||upper(left(id::text,4)))
          where id=$1`, [id, snap]);
    } else {
      await c.query(`update estimates set status=$1 where id=$2`, [status, id]);
    }
    await audit(c, tenantId, { table: "estimates", rowId: id, action: "update", oldValue: { status: cur.status }, newValue: { status }, note: "estimate status changed" });
  });
}

// Pricing guidance for the estimate screen (Release 1 item 2). The engines were
// built in mig 060/062 but never surfaced where the pricing decision happens:
// suggested revenue at the configured target margin, and margin at any price the
// user types. Deterministic arithmetic over fn_estimate_cost output — no AI.
export interface PricingGuidance {
  target_margin: number | null; // fraction, e.g. 0.35
  is_assumed: boolean;          // Art. X §4 — badge until the owner confirms it
}

export async function getPricingGuidance(tenantId: string, serviceLineId: string): Promise<PricingGuidance> {
  const { rows } = await scopedRead(tenantId,
    `select (value #>> '{}')::numeric as m, is_assumed
       from settings
      where tenant_id = $1 and key = 'cost.target_margin_default'
        and (service_line_id = $2 or service_line_id is null)
      order by service_line_id nulls last limit 1`,
    [tenantId, serviceLineId],
  );
  if (!rows[0] || rows[0].m == null) return { target_margin: null, is_assumed: true };
  return { target_margin: Number(rows[0].m), is_assumed: !!rows[0].is_assumed };
}
