import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Frequencies (mig 002) are reference config, but unlike the other catalogues
// they carry a MACHINE-USABLE spec the scheduler computes from deterministically
// (period_unit/period_count/visits_per_period) — never free text. Archive =
// deactivate (is_active). Every write is audit-logged.
export const PERIOD_UNITS = ["day", "week", "month", "year"] as const;

export interface Frequency {
  id: string;
  code: string | null;
  name: string;
  period_unit: string;
  period_count: number;
  visits_per_period: number;
  is_active: boolean;
  is_assumed: boolean;
  assumed_note: string | null;
}

export interface FrequencyInput {
  code?: string;
  name?: string;
  period_unit?: string;
  period_count?: string;
  visits_per_period?: string;
}

const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };
const posInt = (v: string | undefined, label: string): number => {
  const n = Number((v ?? "").trim());
  if (!Number.isInteger(n) || n < 1) throw new Error(`${label} must be a whole number ≥ 1`);
  return n;
};

export async function listFrequenciesAdmin(tenantId: string, includeArchived = false): Promise<Frequency[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, code, name, period_unit, period_count, visits_per_period, is_active, is_assumed, assumed_note
       from frequencies where tenant_id=$1 and ($2 or is_active)
      order by is_active desc, name`,
    [tenantId, includeArchived],
  );
  return rows as Frequency[];
}

function validate(d: FrequencyInput) {
  if (!clean(d.code)) throw new Error("A code is required");
  if (!clean(d.name)) throw new Error("A name is required");
  const unit = (d.period_unit ?? "").trim();
  if (!PERIOD_UNITS.includes(unit as (typeof PERIOD_UNITS)[number])) throw new Error("Invalid period unit");
  return { unit, count: posInt(d.period_count, "Period count"), visits: posInt(d.visits_per_period, "Visits per period") };
}

export async function createFrequency(tenantId: string, serviceLineId: string, d: FrequencyInput): Promise<string> {
  const v = validate(d);
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into frequencies (tenant_id, service_line_id, code, name, period_unit, period_count, visits_per_period, is_assumed)
       values ($1,$2,$3,$4,$5,$6,$7,false) returning id`,
      [tenantId, serviceLineId, clean(d.code), (d.name ?? "").trim(), v.unit, v.count, v.visits],
    );
    await audit(c, tenantId, { table: "frequencies", rowId: rows[0].id, action: "insert", newValue: d, note: "frequency created in admin console" });
    return rows[0].id as string;
  });
}

export async function updateFrequency(tenantId: string, id: string, d: FrequencyInput): Promise<void> {
  const v = validate(d);
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select code, name, period_unit, period_count, visits_per_period, is_assumed from frequencies where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Frequency not found");
    await c.query(
      `update frequencies set code=$1, name=$2, period_unit=$3, period_count=$4, visits_per_period=$5
              ${before.is_assumed ? ", is_assumed=false, confirmed_at=now()" : ""} where id=$6`,
      [clean(d.code), (d.name ?? "").trim(), v.unit, v.count, v.visits, id],
    );
    await audit(c, tenantId, { table: "frequencies", rowId: id, action: "update", oldValue: before, newValue: d, note: "frequency edited in admin console" });
  });
}

export async function archiveFrequency(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update frequencies set is_active=false where id=$1 and tenant_id=$2 and is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "frequencies", rowId: id, action: "update", oldValue: { is_active: true }, newValue: { is_active: false }, note: "frequency archived (deactivated)" });
  });
}

export async function restoreFrequency(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update frequencies set is_active=true where id=$1 and tenant_id=$2 and not is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "frequencies", rowId: id, action: "update", oldValue: { is_active: false }, newValue: { is_active: true }, note: "frequency restored (reactivated)" });
  });
}
