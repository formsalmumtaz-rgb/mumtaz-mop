import "server-only";
import { redactCosting, costVisible } from "../costing-visibility";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Estimation Engine (mig 029). Revenue via fn_price (028); cost via fn_estimate_cost
// (standard rates, operating basis — no depreciation). Deterministic profit preview.

export interface EstimateHeader {
  customer_code: string | null;
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
    `select e.id, e.estimate_number, e.customer_id, cu.trade_name as customer, cu.code as customer_code, e.status,
            e.property_type, e.engagement_type, e.valid_until::text,
            p.revenue::float8, p.est_cost::float8, p.gross_profit::float8, p.line_count
       from estimates e
       left join customers cu on cu.id = e.customer_id
       left join estimate_profitability p on p.estimate_id = e.id
      where e.tenant_id = $1
      order by e.created_at desc`,
    [tenantId],
  );
  // Redacted at the data layer, not the screen: without profit.view the cost and
  // margin keys are ABSENT from the response, so nothing downstream — server
  // component, client component prop, or RSC payload — can carry them.
  return redactCosting(rows as EstimateHeader[]);
}

export async function listEstimatesForCustomer(tenantId: string, customerId: string): Promise<EstimateHeader[]> {
  const { rows } = await scopedRead(tenantId, 
    `select e.id, e.estimate_number, e.customer_id, cu.trade_name as customer, cu.code as customer_code, e.status,
            e.property_type, e.engagement_type, e.valid_until::text, e.contract_id,
            p.revenue::float8, p.est_cost::float8, p.gross_profit::float8, p.line_count
       from estimates e
       left join customers cu on cu.id = e.customer_id
       left join estimate_profitability p on p.estimate_id = e.id
      where e.tenant_id = $1 and e.customer_id = $2
      order by e.created_at desc`,
    [tenantId, customerId],
  );
  return redactCosting(rows as EstimateHeader[]);
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
    `select e.id, e.estimate_number, e.customer_id, cu.trade_name as customer, cu.code as customer_code, e.status,
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
  return {
    header: await redactCosting(hdr[0] as EstimateHeader),
    lines: await redactCosting(lines as EstimateLine[]),
  };
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
      `select customer_id, branch_id, status, contract_id, service_line_id, engagement_type
         from estimates where id=$1 and tenant_id=$2 for update`,
      [estimateId, tenantId])).rows[0];
    if (!e) throw new Error("Estimate not found");
    if (e.status !== "accepted") throw new Error("Only accepted estimates can be converted to a contract");
    if (e.contract_id) throw new Error("This estimate is already converted to a contract");
    if (!e.customer_id) throw new Error("Estimate needs a customer before it can become a contract");
    const sl = e.service_line_id ?? serviceLineId;
    const rev = (await c.query(`select coalesce(revenue,0) as r from estimate_profitability where estimate_id=$1`, [estimateId])).rows[0]?.r ?? 0;

    // Recurring is a CHOICE, not the default (§3.2). A one-off estimate becomes a
    // one-off contract: no frequency, and a term of a single day rather than the
    // standard year. Everything below that derives a frequency is skipped for it —
    // deriving one would silently turn a single call-out into an annual AMC, which
    // is exactly what this fixes.
    const oneOff = e.engagement_type === "ad_hoc";

    // Flow item 8 — the contract INHERITS everything the pipeline already knows:
    //   * pricing model: from the estimate's first line;
    //   * end date: start + 364 days (a standard 1-year term, editable);
    //   * frequency: derived from the customer's premises category through the
    //     municipality compliance matrix (fn_visit_frequency, mig 073) and
    //     matched to a frequency whose annualised visit count equals it.
    //     No match / unknown category ⇒ NULL — the page says why, never guesses.
    const inh = oneOff
      ? { pricing_model_id: (await c.query(
            `select l.pricing_model_id from estimate_lines l
              where l.estimate_id = $1 and l.tenant_id = $2
              order by l.seq nulls last, l.created_at limit 1`, [estimateId, tenantId])).rows[0]?.pricing_model_id ?? null,
          frequency_id: null as string | null, visits_per_year: null as number | null }
      : (await c.query(
      `with first_line as (
         select l.pricing_model_id from estimate_lines l
          where l.estimate_id = $1 and l.tenant_id = $2
          order by l.seq nulls last, l.created_at limit 1
       ), cust as (
         select cu.emirate,
                case cu.attributes->>'industry'
                  when 'restaurant' then 'restaurant' when 'cafe' then 'restaurant'
                  when 'supermarket' then 'supermarket' when 'office' then 'office'
                  when 'warehouse' then 'warehouse' when 'medical' then 'clinic'
                  when 'educational' then 'school' when 'worship' then 'mosque'
                  when 'construction' then 'construction'
                end as ft_code
           from customers cu where cu.id = $3
       ), v as (
         select fn_visit_frequency($2, $4, (select emirate from cust),
                  (select id from facility_types where tenant_id = $2
                    and code = (select ft_code from cust) limit 1), 'general') as n
       )
       select (select pricing_model_id from first_line) as pricing_model_id,
              (select n from v) as visits_per_year,
              (select f.id from frequencies f, v
                where f.tenant_id = $2 and f.service_line_id = $4 and f.is_active and v.n is not null
                  and round(case f.period_unit
                        when 'year'  then f.visits_per_period::numeric / f.period_count
                        when 'month' then f.visits_per_period * 12.0 / f.period_count
                        when 'week'  then f.visits_per_period * 52.0 / f.period_count
                        when 'day'   then f.visits_per_period * 365.0 / f.period_count
                      end) = v.n
                order by (f.period_unit = 'month') desc, f.name limit 1) as frequency_id`,
      [estimateId, tenantId, e.customer_id, sl])).rows[0] ?? {};

    // Contract number auto-generates in the house format (NNNN/YY — the format
    // of the real contracts 1330/25, 1236/26): next sequence WITHIN the current
    // year's series + the 2-digit year (year-scoped, so a stray legacy number in
    // another series can't poison it). Editable until first invoice.
    const contract = (await c.query(
      `insert into contracts(tenant_id, service_line_id, customer_id, contract_value, currency,
                             lifecycle_status, start_date, end_date, pricing_model_id, frequency_id, contract_number,
                             engagement_type)
       select $1,$2,$3,$4,'AED','draft', current_date,
              case when $7::text = 'ad_hoc' then current_date else current_date + 364 end,
              $5, $6,
              (coalesce(max((split_part(contract_number,'/',1))::int), 1000) + 1)::text || '/' || to_char(now(),'YY'),
              $7
         from contracts where tenant_id = $1
          and contract_number ~ ('^\\d+/' || to_char(now(),'YY') || '$')
       returning id`,
      [tenantId, sl, e.customer_id, rev, inh.pricing_model_id ?? null, inh.frequency_id ?? null,
       e.engagement_type ?? null])).rows[0];
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
  customer_address_lines: string[];
  account_number: string | null;
  service_line_code: string | null;
  service_line_name: string | null;
  lines: { description: string; qty: number; rate: number; amount: number }[];
  subtotal: number;
  vat_rate: number;
  vat: number;
  total: number;
  // P0-4: quotation letter content — company boilerplate, configured per service
  // line (mig 079), never typed per quotation. Null/empty means no source for
  // this division yet; the renderer omits the section rather than inventing one.
  salutation: string | null;
  intro_paragraph: string | null;
  scope_items: string[];
  terms: string[];
  signatory_name: string | null;
  signatory_title: string | null;
}

// Customer-facing quotation view — REVENUE ONLY. Never returns cost/margin (retail
// mode by construction). Lines are frozen once the estimate is quoted.
export async function getQuotation(tenantId: string, id: string): Promise<Quotation | null> {
  const { rows: h } = await scopedRead(tenantId,
    `select e.quotation_number, e.status, e.snapshot->>'quoted_at' as quoted_at, e.valid_until::text,
            cu.trade_name as customer, cu.trn as customer_trn, cu.code as account_number,
            cb.address as branch_address, cb.emirate as branch_emirate, cu.emirate as customer_emirate,
            sl.id as service_line_id, sl.code as service_line_code, sl.name as service_line_name
       from estimates e
       left join customers cu on cu.id=e.customer_id
       left join customer_branches cb on cb.id=e.branch_id
       left join service_lines sl on sl.id=e.service_line_id
      where e.tenant_id=$1 and e.id=$2`, [tenantId, id]);
  if (!h[0]) return null;
  const { rows: lines } = await scopedRead(tenantId,
    `select coalesce(nullif(l.description,''), st.name, 'Service') as description,
            l.measure::float8 as qty, l.unit_price::float8 as rate, l.line_total::float8 as amount
       from estimate_lines l left join service_types st on st.id=l.service_type_id
      where l.tenant_id=$1 and l.estimate_id=$2 order by l.seq nulls last, l.created_at`, [tenantId, id]);
  const { rows: vr } = await scopedRead(tenantId,
    `select coalesce((value #>> '{}')::numeric, 5) as v from settings where tenant_id=$1 and key='vat_rate_percent' limit 1`, [tenantId]);
  const vat_rate = Number(vr[0]?.v ?? 5);
  const subtotal = lines.reduce((s: number, l: { amount: number }) => s + Number(l.amount), 0);
  const vat = Math.round(subtotal * vat_rate) / 100;

  const { rows: content } = await scopedRead(tenantId,
    `select key, value from settings
      where tenant_id=$1 and service_line_id=$2 and key like 'quotation.%'`,
    [tenantId, h[0].service_line_id]);
  const cv = (k: string): string | null => (content.find((r: { key: string }) => r.key === k)?.value ?? null) as string | null;
  const cArr = (k: string): string[] => (content.find((r: { key: string }) => r.key === k)?.value ?? []) as string[];

  const addressLines = [h[0].branch_address, h[0].branch_emirate ?? h[0].customer_emirate, "United Arab Emirates"]
    .filter((v): v is string => !!v);

  return {
    quotation_number: h[0].quotation_number, status: h[0].status, quoted_at: h[0].quoted_at,
    valid_until: h[0].valid_until, customer: h[0].customer, customer_trn: h[0].customer_trn,
    customer_address_lines: addressLines, account_number: h[0].account_number,
    service_line_code: h[0].service_line_code, service_line_name: h[0].service_line_name,
    lines: lines as { description: string; qty: number; rate: number; amount: number }[],
    subtotal, vat_rate, vat, total: subtotal + vat,
    salutation: cv("quotation.salutation"), intro_paragraph: cv("quotation.intro_paragraph"),
    scope_items: cArr("quotation.scope_items"), terms: cArr("quotation.terms"),
    signatory_name: cv("quotation.signatory_name"), signatory_title: cv("quotation.signatory_title"),
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

// Flow item 5 — THE GOVERNING RULE: a screen never asks for what the system
// can compute. These are the engine-computed prefills for an estimate line —
// labour hours, travel distance, per-m² material rates, reference rates —
// each with the basis it was computed from (shown in the UI, always editable).
export interface LineDefaults {
  treatment_hours: number;        // cost.treatment_hours_per_visit
  travel_hours: number;           // round_trip / cost.travel_speed_kmh
  labour_hours: number;           // treatment + travel (travel time IS paid)
  round_trip_km: number;
  distance_basis: string;         // human basis: route computed vs company default
  material_rate_spray_per_m2: number;  // Σ qty/m² × landed cost (visit_type=spray)
  material_rate_gel_per_m2: number;
  labour_rate: number;
  vehicle_rate: number;
  overhead_enabled: boolean;
  overhead_rate: number;
  target_margin: number | null;   // 0.70 (owner-set)
  reference_rates: { label: string; aed: number }[];
  assumed_keys: string[];         // which inputs are ASSUMED (flagged in UI)
}

export async function getLineDefaults(
  tenantId: string, serviceLineId: string, estimateId: string,
  source: "estimates" | "surveys" = "estimates",
): Promise<LineDefaults> {
  // A session without profit.view gets the OPERATIONAL prefills — hours, travel
  // distance, the basis sentence, the reference rates — and none of the rates
  // those were costed at. The client component then cannot compute a cost or a
  // margin, because it never receives the inputs.
  return redactCosting(await getLineDefaultsUnredacted(tenantId, serviceLineId, estimateId, source));
}

// The engine's own view — every rate, unredacted. Server-side only, and never
// returned to a caller that renders: suggestLinePrice uses it to produce one
// number. Not exported.
async function getLineDefaultsUnredacted(
  tenantId: string, serviceLineId: string, estimateId: string,
  source: "estimates" | "surveys" = "estimates",
): Promise<LineDefaults> {
  // One round trip: settings + per-m² material rates + the estimate's/survey's
  // site-pin distance (PostGIS straight-line × road factor) in a single query.
  // `source` picks the header table (identical customer/branch shape) — never
  // interpolated from user input.
  const headerTable = source === "surveys" ? "surveys" : "estimates";
  const { rows } = await scopedRead(tenantId,
    `with s as (
       select key,
              case when value #>> '{}' ~ '^-?[0-9]+\\.?[0-9]*$' then (value #>> '{}')::numeric end as num,
              value, is_assumed,
              row_number() over (partition by key order by service_line_id nulls last) as rn
         from settings
        where tenant_id = $1 and (service_line_id = $2 or service_line_id is null)
          and key in ('cost.treatment_hours_per_visit','cost.travel_speed_kmh',
                      'cost.default_job_one_way_km','cost.road_distance_factor',
                      'cost.standard_labour_rate_hourly','cost.standard_vehicle_rate_per_km',
                      'cost.overhead_enabled','cost.overhead_rate_per_labour_hour',
                      'cost.target_margin_default','pricing.reference_rates','cost.base_location')
     ), sv as (select * from s where rn = 1
     ), rates as (
       select c.visit_type, sum(c.qty_per_m2 * fn_item_standard_cost($1, c.item_id)) as rate
         from treatment_visit_consumption c
        where c.tenant_id = $1 and (c.service_line_id = $2 or c.service_line_id is null) and c.is_active
        group by c.visit_type
     ), site as (
       select cb.location as pin from ${headerTable} e
         left join customer_branches cb on cb.id = coalesce(
           e.branch_id,
           (select b.id from customer_branches b
             where b.customer_id = e.customer_id and b.is_active and b.location is not null
             order by b.created_at limit 1))
        where e.id = $3 and e.tenant_id = $1
     )
     select
       (select num from sv where key='cost.treatment_hours_per_visit') as treat_hours,
       (select num from sv where key='cost.travel_speed_kmh') as travel_speed,
       (select num from sv where key='cost.default_job_one_way_km') as default_km,
       (select num from sv where key='cost.road_distance_factor') as road_factor,
       (select num from sv where key='cost.standard_labour_rate_hourly') as labour_rate,
       (select num from sv where key='cost.standard_vehicle_rate_per_km') as vehicle_rate,
       (select value #>> '{}' from sv where key='cost.overhead_enabled') as overhead_enabled,
       (select num from sv where key='cost.overhead_rate_per_labour_hour') as overhead_rate,
       (select num from sv where key='cost.target_margin_default') as target_margin,
       (select value from sv where key='pricing.reference_rates') as reference_rates,
       (select rate from rates where visit_type='spray') as rate_spray,
       (select rate from rates where visit_type='gel') as rate_gel,
       (select case when pin is not null and (select value from sv where key='cost.base_location') is not null
          then st_distancesphere(
                 pin::geometry,
                 st_setsrid(st_makepoint(
                   ((select value from sv where key='cost.base_location')->>'lng')::float8,
                   ((select value from sv where key='cost.base_location')->>'lat')::float8), 4326)) / 1000.0
          end from site) as straight_km,
       (select coalesce(jsonb_agg(key), '[]'::jsonb) from sv where is_assumed
          and key in ('cost.treatment_hours_per_visit','cost.travel_speed_kmh',
                      'cost.default_job_one_way_km','cost.road_distance_factor',
                      'cost.overhead_rate_per_labour_hour','cost.target_margin_default')) as assumed_keys`,
    [tenantId, serviceLineId, estimateId]);
  const r = rows[0] ?? {};
  const treat = Number(r.treat_hours ?? 1);
  const roadFactor = Number(r.road_factor ?? 1.3);
  const straight = r.straight_km != null ? Number(r.straight_km) : null;
  const oneWay = straight != null ? Math.round(straight * roadFactor * 10) / 10 : Number(r.default_km ?? 16);
  const roundTrip = Math.round(oneWay * 2 * 10) / 10;
  const speed = Number(r.travel_speed ?? 0);
  const travelHours = speed > 0 ? Math.round((roundTrip / speed) * 100) / 100 : 0;
  const full: LineDefaults = {
    treatment_hours: treat,
    travel_hours: travelHours,
    labour_hours: Math.round((treat + travelHours) * 100) / 100,
    round_trip_km: roundTrip,
    distance_basis: straight != null
      ? `${straight.toFixed(1)} km straight line × ${roadFactor} road factor × 2 (site pin → base)`
      : `company default ${Number(r.default_km ?? 16)} km one-way — no site pin on this customer`,
    material_rate_spray_per_m2: Number(r.rate_spray ?? 0),
    material_rate_gel_per_m2: Number(r.rate_gel ?? 0),
    labour_rate: Number(r.labour_rate ?? 0),
    vehicle_rate: Number(r.vehicle_rate ?? 0),
    overhead_enabled: r.overhead_enabled === "true",
    overhead_rate: Number(r.overhead_rate ?? 0),
    target_margin: r.target_margin != null ? Number(r.target_margin) : null,
    reference_rates: Array.isArray(r.reference_rates) ? r.reference_rates : [],
    assumed_keys: Array.isArray(r.assumed_keys) ? r.assumed_keys : [],
  };
  // Raw, by contract — suggestLinePrice needs the real rates to produce the one
  // number it returns. Nothing that renders may call this.
  return full;
}

// The suggested price, and ONLY the suggested price.
//
// The estimate screen's suggestion depends on what the user is typing, so it
// cannot be precomputed — but it must not be computed in the browser either,
// because that needs the cost rates. So it is computed here, per request, and
// returns one number. No cost, no margin, no target percentage: knowing "we
// aim for 70%" is itself margin information, and the role that calls this is
// the role barred from it.
export async function suggestLinePrice(
  tenantId: string, serviceLineId: string, estimateId: string,
  inputs: { labour_hours?: number; distance_km?: number; material_cost?: number; area_m2?: number },
  source: "estimates" | "surveys" = "estimates",
): Promise<{ suggested: number | null }> {
  const d = await getLineDefaultsUnredacted(tenantId, serviceLineId, estimateId, source);
  const tm = d.target_margin;
  if (tm == null || tm >= 1) return { suggested: null };
  const hours = Number(inputs.labour_hours ?? d.labour_hours) || 0;
  const km = Number(inputs.distance_km ?? d.round_trip_km) || 0;
  // The caller may send an AREA instead of a material cost — a session without
  // profit.view has no per-m² rate to multiply by, so the multiplication happens
  // here. Operational input in, one price out.
  const material = inputs.material_cost != null
    ? Number(inputs.material_cost) || 0
    : (Number(inputs.area_m2 ?? 0) || 0) * d.material_rate_spray_per_m2;
  const cost = material + d.labour_rate * hours + d.vehicle_rate * km
             + (d.overhead_enabled ? d.overhead_rate * hours : 0);
  if (!(cost > 0)) return { suggested: null };
  return { suggested: Math.round((cost / (1 - tm)) * 100) / 100 };
}

// Geocode-and-remember the base departure pin (cost.base_location) from the real
// office address (cost.base_address). Runs at most once — after that the pin is
// data. Never blocks the caller: geocode failure just leaves the default-km path.
// Once the pin exists it is data and never disappears, so the answer is
// memoised for the life of the process. Before this, every render of the survey
// and estimate screens paid ~110ms — a full connect/preamble/query/commit — to
// be told again that the pin was already there. Measured: it was 19% of the
// survey page.
const basePinKnown = new Set<string>();

export async function ensureBaseLocation(tenantId: string): Promise<void> {
  if (basePinKnown.has(tenantId)) return;
  const { rows } = await scopedRead(tenantId,
    `select
       (select 1 from settings where tenant_id=$1 and key='cost.base_location' limit 1) as has_pin,
       (select value #>> '{}' from settings where tenant_id=$1 and key='cost.base_address' limit 1) as addr`,
    [tenantId]);
  if (rows[0]?.has_pin) { basePinKnown.add(tenantId); return; }
  if (!rows[0]?.addr) return;   // nothing to geocode FROM — recheck next time
  try {
    const { routeProvider } = await import("../route-provider");
    const geo = await routeProvider.geocode(rows[0].addr);
    if (!geo) return;
    basePinKnown.add(tenantId);
    await withTenantTx(tenantId, (c) =>
      c.query(
        `insert into settings (tenant_id, key, value, description, is_assumed)
         select $1, 'cost.base_location', $2::jsonb,
                'Geocoded pin for cost.base_address (server-side geocode, Art. XVII). Editable.', false
         where not exists (select 1 from settings where tenant_id = $1 and key = 'cost.base_location')`,
        [tenantId, JSON.stringify({ lat: geo.location.lat, lng: geo.location.lng, source: "geocode" })]));
  } catch {
    // no key / provider down — distance prefill falls back to the default km
  }
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
