import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Manpower supply (mig 046). A manpower agreement extends a contract 1:1; monthly
// timesheets snapshot deterministic revenue/cost/profit (fn_manpower_revenue /
// fn_manpower_cost). Pure arithmetic — no AI in the numbers.
export const BILLING_BASES = ["fixed_monthly", "per_person_month", "per_hour"] as const;
export const BASIS_LABEL: Record<string, string> = {
  fixed_monthly: "Fixed monthly", per_person_month: "Per person / month", per_hour: "Per hour",
};

export interface ManpowerAgreement {
  contract_id: string;
  agreement_id: string | null;
  contract_number: string | null;
  customer: string | null;
  lifecycle_status: string;
  billing_basis: string | null;
  personnel_count: number | null;
  rate: string | null;
  salary_cost_per_person_monthly: string | null;
  accommodation_cost_monthly: string | null;
  other_cost_monthly: string | null;
  notes: string | null;
  is_assumed: boolean;
}

export interface ManpowerTimesheet {
  id: string; period: string; personnel_count: number; hours_worked: string;
  revenue: string; cost: string; profit: string; notes: string | null;
}

export interface AgreementInput {
  billing_basis?: string; personnel_count?: string; rate?: string;
  salary_cost_per_person_monthly?: string; accommodation_cost_monthly?: string;
  other_cost_monthly?: string; notes?: string;
}

const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };
const num0 = (v: string | undefined, label: string): number => {
  const t = (v ?? "").trim(); const n = t === "" ? 0 : Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number ≥ 0`);
  return n;
};
const intMin = (v: string | undefined, label: string, min: number): number => {
  const t = (v ?? "").trim(); const n = t === "" ? min : Number(t);
  if (!Number.isInteger(n) || n < min) throw new Error(`${label} must be a whole number ≥ ${min}`);
  return n;
};
const basisOf = (v?: string): string => {
  const t = (v ?? "").trim();
  if (!(BILLING_BASES as readonly string[]).includes(t)) throw new Error("Invalid billing basis");
  return t;
};

// Every manpower agreement with its contract + customer.
export async function listManpowerAgreements(tenantId: string): Promise<ManpowerAgreement[]> {
  const { rows } = await scopedRead(tenantId,
    `select ct.id as contract_id, a.id as agreement_id, ct.contract_number, cu.trade_name as customer,
            ct.lifecycle_status, a.billing_basis, a.personnel_count, a.rate::text,
            a.salary_cost_per_person_monthly::text, a.accommodation_cost_monthly::text,
            a.other_cost_monthly::text, a.notes, a.is_assumed
       from manpower_agreements a
       join contracts ct on ct.id = a.contract_id
       left join customers cu on cu.id = ct.customer_id
      where a.tenant_id = $1
      order by cu.trade_name`,
    [tenantId]);
  return rows as ManpowerAgreement[];
}

// Contracts that don't yet have a manpower agreement (candidates for setup).
export async function listContractsWithoutManpower(tenantId: string): Promise<{ id: string; label: string }[]> {
  const { rows } = await scopedRead(tenantId,
    `select ct.id, coalesce(ct.contract_number,'(no number)') || ' — ' || coalesce(cu.trade_name,'?') as label
       from contracts ct
       left join customers cu on cu.id = ct.customer_id
      where ct.tenant_id=$1 and ct.archived_at is null
        and not exists (select 1 from manpower_agreements a where a.contract_id = ct.id)
      order by cu.trade_name limit 200`,
    [tenantId]);
  return rows as { id: string; label: string }[];
}

export async function setupManpowerAgreement(tenantId: string, contractId: string, d: AgreementInput): Promise<void> {
  const basis = basisOf(d.billing_basis);
  await withTenantTx(tenantId, async (c) => {
    const owns = await c.query(`select id from contracts where id=$1 and tenant_id=$2`, [contractId, tenantId]);
    if (!owns.rowCount) throw new Error("Contract not found");
    const { rows } = await c.query(
      `insert into manpower_agreements (tenant_id, contract_id, billing_basis, personnel_count, rate,
          salary_cost_per_person_monthly, accommodation_cost_monthly, other_cost_monthly, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [tenantId, contractId, basis, intMin(d.personnel_count, "Personnel", 1), num0(d.rate, "Rate"),
       num0(d.salary_cost_per_person_monthly, "Salary cost"), num0(d.accommodation_cost_monthly, "Accommodation"),
       num0(d.other_cost_monthly, "Other cost"), clean(d.notes)]);
    await audit(c, tenantId, { table: "manpower_agreements", rowId: rows[0].id, action: "insert", newValue: { contract_id: contractId, ...d }, note: "manpower agreement created" });
  });
}

export async function updateManpowerAgreement(tenantId: string, contractId: string, d: AgreementInput): Promise<void> {
  const basis = basisOf(d.billing_basis);
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select id, billing_basis, personnel_count, rate::text, salary_cost_per_person_monthly::text,
             accommodation_cost_monthly::text, other_cost_monthly::text, notes, is_assumed
        from manpower_agreements where contract_id=$1 and tenant_id=$2 for update`, [contractId, tenantId])).rows[0];
    if (!before) throw new Error("Manpower agreement not found");
    await c.query(
      `update manpower_agreements set billing_basis=$1, personnel_count=$2, rate=$3, salary_cost_per_person_monthly=$4,
              accommodation_cost_monthly=$5, other_cost_monthly=$6, notes=$7
              ${before.is_assumed ? ", is_assumed=false" : ""} where id=$8`,
      [basis, intMin(d.personnel_count, "Personnel", 1), num0(d.rate, "Rate"), num0(d.salary_cost_per_person_monthly, "Salary cost"),
       num0(d.accommodation_cost_monthly, "Accommodation"), num0(d.other_cost_monthly, "Other cost"), clean(d.notes), before.id]);
    await audit(c, tenantId, { table: "manpower_agreements", rowId: before.id, action: "update", oldValue: before, newValue: d, note: "manpower agreement edited" });
  });
}

export async function listTimesheets(tenantId: string, contractId: string): Promise<ManpowerTimesheet[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, period::text, personnel_count, hours_worked::text, revenue::text, cost::text, profit::text, notes
       from manpower_timesheets where tenant_id=$1 and contract_id=$2 order by period desc`,
    [tenantId, contractId]);
  return rows as ManpowerTimesheet[];
}

// Enter a month's actuals; revenue/cost/profit computed deterministically in-DB
// from the agreement + the entered personnel/hours, then snapshotted.
export async function addTimesheet(
  tenantId: string, contractId: string, d: { period?: string; personnel_count?: string; hours_worked?: string; notes?: string },
): Promise<void> {
  const period = (d.period ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Period must be a month (YYYY-MM)");
  const personnel = intMin(d.personnel_count, "Personnel", 0);
  const hours = num0(d.hours_worked, "Hours worked");
  await withTenantTx(tenantId, async (c) => {
    const a = (await c.query(`select billing_basis, rate, salary_cost_per_person_monthly, accommodation_cost_monthly, other_cost_monthly
        from manpower_agreements where contract_id=$1 and tenant_id=$2`, [contractId, tenantId])).rows[0];
    if (!a) throw new Error("Set up the manpower agreement first");
    const { rows } = await c.query(
      `insert into manpower_timesheets (tenant_id, contract_id, period, personnel_count, hours_worked, revenue, cost, profit, notes)
       values ($1,$2,($3||'-01')::date,$4,$5,
         fn_manpower_revenue($6,$7,$4,$5),
         fn_manpower_cost($8,$4,$9,$10),
         fn_manpower_revenue($6,$7,$4,$5) - fn_manpower_cost($8,$4,$9,$10),
         $11)
       returning id, revenue::text, cost::text, profit::text`,
      [tenantId, contractId, period, personnel, hours, a.billing_basis, a.rate,
       a.salary_cost_per_person_monthly, a.accommodation_cost_monthly, a.other_cost_monthly, clean(d.notes)]);
    await audit(c, tenantId, { table: "manpower_timesheets", rowId: rows[0].id, action: "insert",
      newValue: { period, personnel, hours, revenue: rows[0].revenue, cost: rows[0].cost, profit: rows[0].profit }, note: `manpower timesheet ${period}` });
  });
}
