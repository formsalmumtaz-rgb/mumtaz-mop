import "server-only";
import { pool } from "../db";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Per-technician fully-loaded employment cost (mig 019). Effective-dated,
// version-immutable: editing OPENS A NEW VERSION and closes the prior one — the
// value columns of a version never change, so historical job costs stay correct.
// monthly_employment_cost and hourly_cost are DB-generated; we read them back.

export interface EmployeeCost {
  technician_id: string;
  code: string | null;
  full_name: string | null;
  version_id: string | null;
  version_no: number | null;
  basic_salary: string | null;
  accommodation_monthly: string | null;
  transport_allowance_monthly: string | null;
  medical_insurance_annual: string | null;
  air_ticket_annual: string | null;
  visa_cost: string | null;
  emirates_id_cost: string | null;
  visa_eid_amortisation_months: number | null;
  gratuity_days_per_year: string | null;
  productive_hours_month: string | null;
  monthly_employment_cost: string | null;
  hourly_cost: string | null;
}

// One row per technician; left-joins the current (open) cost version if any.
export async function listEmployeeCosts(tenantId: string): Promise<EmployeeCost[]> {
  const { rows } = await pool.query(
    `select t.id as technician_id, t.code, t.full_name,
            ec.id as version_id, ec.version_no,
            ec.basic_salary::text, ec.accommodation_monthly::text, ec.transport_allowance_monthly::text,
            ec.medical_insurance_annual::text, ec.air_ticket_annual::text, ec.visa_cost::text, ec.emirates_id_cost::text,
            ec.visa_eid_amortisation_months, ec.gratuity_days_per_year::text, ec.productive_hours_month::text,
            ec.monthly_employment_cost::text, ec.hourly_cost::text
       from technicians t
       left join employee_cost_components ec
         on ec.technician_id = t.id and ec.effective_to is null
      where t.tenant_id = $1 and t.is_active
      order by t.code`,
    [tenantId],
  );
  return rows as EmployeeCost[];
}

export interface EmployeeCostInput {
  basic_salary?: string;
  accommodation_monthly?: string;
  transport_allowance_monthly?: string;
  medical_insurance_annual?: string;
  air_ticket_annual?: string;
  visa_cost?: string;
  emirates_id_cost?: string;
  visa_eid_amortisation_months?: string;
  gratuity_days_per_year?: string;
  productive_hours_month?: string;
}

const n = (v: string | undefined, def: number): number => {
  const t = (v ?? "").trim();
  if (t === "") return def;
  const x = Number(t);
  if (!Number.isFinite(x) || x < 0) throw new Error(`Invalid number: "${t}"`);
  return x;
};

// Save a technician's cost components as a NEW version: close the open one
// (effective_to = today) and insert version_no+1. Immutable-safe.
export async function saveEmployeeCost(tenantId: string, serviceLineId: string, technicianId: string, d: EmployeeCostInput): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const owns = await c.query(`select 1 from technicians where id=$1 and tenant_id=$2`, [technicianId, tenantId]);
    if (!owns.rowCount) throw new Error("Technician not found");
    const cur = (await c.query(
      `select id, version_no from employee_cost_components where technician_id=$1 and effective_to is null for update`,
      [technicianId],
    )).rows[0];
    let nextNo = 1;
    if (cur) {
      await c.query(`update employee_cost_components set effective_to = current_date where id=$1`, [cur.id]); // close prior (immutable-allowed)
      nextNo = cur.version_no + 1;
    }
    const ins = await c.query(
      `insert into employee_cost_components
         (tenant_id, service_line_id, technician_id, version_no,
          basic_salary, accommodation_monthly, transport_allowance_monthly, medical_insurance_annual,
          air_ticket_annual, visa_cost, emirates_id_cost, visa_eid_amortisation_months,
          gratuity_days_per_year, productive_hours_month)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning id, monthly_employment_cost::text as monthly, hourly_cost::text as hourly`,
      [
        tenantId, serviceLineId, technicianId, nextNo,
        n(d.basic_salary, 0), n(d.accommodation_monthly, 0), n(d.transport_allowance_monthly, 0), n(d.medical_insurance_annual, 0),
        n(d.air_ticket_annual, 0), n(d.visa_cost, 0), n(d.emirates_id_cost, 0), n(d.visa_eid_amortisation_months, 24),
        n(d.gratuity_days_per_year, 21), n(d.productive_hours_month, 176),
      ],
    );
    await audit(c, tenantId, {
      table: "employee_cost_components", rowId: ins.rows[0].id, action: "insert",
      newValue: { version_no: nextNo, ...d, monthly_employment_cost: ins.rows[0].monthly, hourly_cost: ins.rows[0].hourly },
      note: `employee cost version ${nextNo} set via cost setup`,
    });
  });
}
