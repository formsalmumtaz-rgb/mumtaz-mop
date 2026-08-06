import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Survey Module (mig 032). Site-visit capture whose lines mirror estimate_lines
// and price with the same fn_price / fn_estimate_cost — so a survey shows a profit
// preview and seeds an estimate with no re-keying ("data entered once").

export interface SurveyHeader {
  id: string;
  survey_number: string | null;
  customer_id: string | null;
  customer: string | null;
  surveyor_id: string | null;
  surveyor: string | null;
  survey_date: string | null;
  status: string;
  property_type: string | null;
  estimate_id: string | null;
  revenue: number;
  est_cost: number;
  gross_profit: number;
  line_count: number;
}

export interface SurveyLine {
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
  observed_notes: string | null;
}

export async function listSurveys(tenantId: string): Promise<SurveyHeader[]> {
  const { rows } = await scopedRead(tenantId, 
    `select s.id, s.survey_number, s.customer_id, cu.trade_name as customer,
            s.surveyor_id, t.full_name as surveyor, s.survey_date::text, s.status,
            s.property_type, s.estimate_id,
            p.revenue::float8, p.est_cost::float8, p.gross_profit::float8, p.line_count
       from surveys s
       left join customers cu on cu.id = s.customer_id
       left join technicians t on t.id = s.surveyor_id
       left join survey_profitability p on p.survey_id = s.id
      where s.tenant_id = $1
      order by s.survey_date desc, s.created_at desc`,
    [tenantId],
  );
  return rows as SurveyHeader[];
}

export async function listSurveysForCustomer(tenantId: string, customerId: string): Promise<SurveyHeader[]> {
  const { rows } = await scopedRead(tenantId, 
    `select s.id, s.survey_number, s.customer_id, cu.trade_name as customer,
            s.surveyor_id, t.full_name as surveyor, s.survey_date::text, s.status,
            s.property_type, s.estimate_id,
            p.revenue::float8, p.est_cost::float8, p.gross_profit::float8, p.line_count
       from surveys s
       left join customers cu on cu.id = s.customer_id
       left join technicians t on t.id = s.surveyor_id
       left join survey_profitability p on p.survey_id = s.id
      where s.tenant_id = $1 and s.customer_id = $2
      order by s.survey_date desc, s.created_at desc`,
    [tenantId, customerId],
  );
  return rows as SurveyHeader[];
}

export async function getSurvey(tenantId: string, id: string): Promise<{ header: SurveyHeader; lines: SurveyLine[] } | null> {
  const { rows: hdr } = await scopedRead(tenantId, 
    `select s.id, s.survey_number, s.customer_id, cu.trade_name as customer,
            s.surveyor_id, t.full_name as surveyor, s.survey_date::text, s.status,
            s.property_type, s.estimate_id,
            p.revenue::float8, p.est_cost::float8, p.gross_profit::float8, p.line_count
       from surveys s
       left join customers cu on cu.id = s.customer_id
       left join technicians t on t.id = s.surveyor_id
       left join survey_profitability p on p.survey_id = s.id
      where s.tenant_id = $1 and s.id = $2`,
    [tenantId, id],
  );
  if (!hdr[0]) return null;
  const { rows: lines } = await scopedRead(tenantId, 
    `select l.id, l.service_type_id, st.name as service_name, l.pricing_model_id, pm.name as model_name, pm.model_type,
            l.description, l.unit_price::float8, l.measure::float8, l.measures, l.line_total::float8,
            l.est_labour_hours::float8, l.est_distance_km::float8, l.est_material_cost::float8, l.est_cost::float8, l.observed_notes
       from survey_lines l
       left join service_types st on st.id = l.service_type_id
       left join pricing_models pm on pm.id = l.pricing_model_id
      where l.tenant_id = $1 and l.survey_id = $2 order by l.seq nulls last, l.created_at`,
    [tenantId, id],
  );
  return { header: hdr[0] as SurveyHeader, lines: lines as SurveyLine[] };
}

const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };
const num = (v: string | undefined, label: string): number => {
  const t = (v ?? "").trim();
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be ≥ 0`);
  return n;
};

export async function createSurvey(
  tenantId: string, serviceLineId: string,
  d: { customer_id?: string; branch_id?: string; surveyor_id?: string; survey_date?: string; property_type?: string; notes?: string },
): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into surveys (tenant_id, service_line_id, customer_id, branch_id, surveyor_id, survey_date, property_type, notes, status)
       values ($1,$2,$3,$4,$5,coalesce($6::date, current_date),$7,$8,'draft') returning id`,
      [tenantId, serviceLineId, clean(d.customer_id), clean(d.branch_id), clean(d.surveyor_id), clean(d.survey_date), clean(d.property_type), clean(d.notes)],
    );
    await audit(c, tenantId, { table: "surveys", rowId: rows[0].id, action: "insert", newValue: d, note: "survey created" });
    return rows[0].id as string;
  });
}

export interface SurveyLineInput {
  service_type_id?: string; pricing_model_id?: string; description?: string;
  unit_price?: string; measure?: string; measures?: Record<string, number>;
  est_labour_hours?: string; est_distance_km?: string; est_material_cost?: string; observed_notes?: string;
}

// Same fn_price / fn_estimate_cost as estimation, so survey and estimate numbers
// are byte-for-byte identical.
export async function addSurveyLine(tenantId: string, serviceLineId: string, surveyId: string, d: SurveyLineInput): Promise<void> {
  if (!d.pricing_model_id) throw new Error("Pricing model is required");
  await withTenantTx(tenantId, async (c) => {
    const owns = await c.query(`select status from surveys where id=$1 and tenant_id=$2`, [surveyId, tenantId]);
    if (!owns.rowCount) throw new Error("Survey not found");
    if (owns.rows[0].status !== "draft") throw new Error("Only draft surveys can be edited");
    const hours = num(d.est_labour_hours, "Labour hours"), km = num(d.est_distance_km, "Distance"), mat = num(d.est_material_cost, "Material");
    const up = num(d.unit_price, "Unit price"), meas = num(d.measure, "Measure");
    const { rows } = await c.query(
      `insert into survey_lines
         (tenant_id, survey_id, service_type_id, pricing_model_id, description, unit_price, measure, measures,
          line_total, est_labour_hours, est_distance_km, est_material_cost, est_cost, observed_notes)
       select $1,$2,$3,$4,$5,$6,$7,$8::jsonb,
              fn_price(pm.model_type, $6, $7, pm.formula_spec, $8::jsonb),
              $9,$10,$11, fn_estimate_cost($1,$12,$9,$10,$11), $13
         from pricing_models pm where pm.id=$4 and pm.tenant_id=$1
       returning id, line_total::float8, est_cost::float8`,
      [tenantId, surveyId, clean(d.service_type_id), d.pricing_model_id, clean(d.description), up, meas,
       JSON.stringify(d.measures ?? {}), hours, km, mat, serviceLineId, clean(d.observed_notes)],
    );
    if (!rows[0]) throw new Error("Pricing model not found");
    await audit(c, tenantId, { table: "survey_lines", rowId: rows[0].id, action: "insert", newValue: { ...d, line_total: rows[0].line_total, est_cost: rows[0].est_cost }, note: "survey line added" });
  });
}

export async function deleteSurveyLine(tenantId: string, lineId: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(
      `delete from survey_lines l using surveys s
        where l.id=$1 and l.tenant_id=$2 and s.id=l.survey_id and s.status='draft' returning l.id`,
      [lineId, tenantId],
    );
    if (r.rowCount) await audit(c, tenantId, { table: "survey_lines", rowId: lineId, action: "soft_delete", note: "survey line removed" });
  });
}

export async function setSurveyStatus(tenantId: string, id: string, status: string): Promise<void> {
  if (!["draft", "completed", "cancelled"].includes(status)) throw new Error("Invalid status");
  await withTenantTx(tenantId, async (c) => {
    await c.query(`update surveys set status=$1 where id=$2 and tenant_id=$3`, [status, id, tenantId]);
    await audit(c, tenantId, { table: "surveys", rowId: id, action: "update", newValue: { status }, note: "survey status changed" });
  });
}

// Seed an estimate from a survey (copies header context + every line). One-shot:
// refuses if the survey is already linked to an estimate ("data entered once").
export async function createEstimateFromSurvey(tenantId: string, serviceLineId: string, surveyId: string): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    const s = (await c.query(
      `select customer_id, branch_id, property_type, service_line_id, estimate_id from surveys where id=$1 and tenant_id=$2 for update`,
      [surveyId, tenantId])).rows[0];
    if (!s) throw new Error("Survey not found");
    if (s.estimate_id) throw new Error("This survey has already been converted to an estimate");
    const sl = s.service_line_id ?? serviceLineId;
    const est = (await c.query(
      `insert into estimates (tenant_id, service_line_id, customer_id, branch_id, property_type, status, notes)
       values ($1,$2,$3,$4,$5,'draft',$6) returning id`,
      [tenantId, sl, s.customer_id, s.branch_id, s.property_type, "Seeded from survey"])).rows[0];
    // copy every survey line into an estimate line (values already computed identically)
    await c.query(
      `insert into estimate_lines
         (tenant_id, estimate_id, service_type_id, pricing_model_id, description, unit_price, measure, measures,
          line_total, est_labour_hours, est_distance_km, est_material_cost, est_cost, seq)
       select tenant_id, $2, service_type_id, pricing_model_id, description, unit_price, measure, measures,
              line_total, est_labour_hours, est_distance_km, est_material_cost, est_cost, seq
         from survey_lines where survey_id=$1 and tenant_id=$3`,
      [surveyId, est.id, tenantId]);
    await c.query(`update surveys set estimate_id=$1 where id=$2`, [est.id, surveyId]);
    await audit(c, tenantId, { table: "surveys", rowId: surveyId, action: "update", newValue: { estimate_id: est.id }, note: "survey converted to estimate" });
    await audit(c, tenantId, { table: "estimates", rowId: est.id, action: "insert", newValue: { from_survey: surveyId }, note: "estimate seeded from survey" });
    return est.id as string;
  });
}
