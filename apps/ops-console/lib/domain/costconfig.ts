import "server-only";
import { pool } from "../db";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Cost configuration: the standard rates + GL account codes the costing engine
// (mig 019-023) is gated on. Until these are confirmed, fn_cost_job produces
// nothing. All writes are audit-logged.

export interface CostRates {
  labour_rate: string | null;
  labour_assumed: boolean;
  overhead_enabled: boolean;
  overhead_rate: string | null;
  overhead_assumed: boolean;
  vehicle_rate: string | null;
  vehicle_assumed: boolean;
}

export interface CostAccount {
  key: string;         // settings key, e.g. cost.account_code.labour
  label: string;
  code: string | null;
  account_name: string | null;
  is_assumed: boolean;
}

export interface ReadinessStatus {
  ready: boolean;
  unconfirmed: number;
  items: string[];
  uncosted_jobs: number; // completed jobs with no current cost — what backfill will cost
}

const RATE_KEYS = {
  labour: "cost.standard_labour_rate_hourly",
  overheadEnabled: "cost.overhead_enabled",
  overheadRate: "cost.overhead_rate_per_labour_hour",
  vehicle: "cost.standard_vehicle_rate_per_km",
} as const;

// The GL account-code map the costing gate checks (labour + vehicle; overhead when on).
const ACCOUNT_KEYS: { key: string; label: string }[] = [
  { key: "cost.account_code.labour", label: "Direct labour" },
  { key: "cost.account_code.labour_variance", label: "Labour variance" },
  { key: "cost.account_code.labour_clearing", label: "Labour clearing" },
  { key: "cost.account_code.vehicle", label: "Vehicle running cost" },
  { key: "cost.account_code.vehicle_variance", label: "Vehicle variance" },
  { key: "cost.account_code.vehicle_clearing", label: "Vehicle clearing" },
  { key: "cost.account_code.overhead", label: "Overhead" },
  { key: "cost.account_code.overhead_variance", label: "Overhead variance" },
  { key: "cost.account_code.overhead_clearing", label: "Overhead clearing" },
];

async function settingRow(tenantId: string, key: string): Promise<{ value: string | null; is_assumed: boolean } | null> {
  const { rows } = await pool.query(
    `select value #>> '{}' as value, is_assumed from settings where tenant_id=$1 and key=$2 order by service_line_id nulls last limit 1`,
    [tenantId, key],
  );
  return rows[0] ?? null;
}

export async function getCostRates(tenantId: string): Promise<CostRates> {
  const [lab, ohEn, ohRate, veh] = await Promise.all([
    settingRow(tenantId, RATE_KEYS.labour),
    settingRow(tenantId, RATE_KEYS.overheadEnabled),
    settingRow(tenantId, RATE_KEYS.overheadRate),
    settingRow(tenantId, RATE_KEYS.vehicle),
  ]);
  return {
    labour_rate: lab?.value ?? null,
    labour_assumed: lab?.is_assumed ?? true,
    overhead_enabled: ohEn?.value === "true",
    overhead_rate: ohRate?.value ?? null,
    overhead_assumed: ohRate?.is_assumed ?? true,
    vehicle_rate: veh?.value ?? null,
    vehicle_assumed: veh?.is_assumed ?? true,
  };
}

export async function listCostAccounts(tenantId: string): Promise<CostAccount[]> {
  const { rows } = await pool.query(
    `select s.key, (s.value #>> '{}') as code, a.name as account_name, a.is_assumed
       from settings s
       left join accounts a on a.tenant_id = s.tenant_id and a.code = (s.value #>> '{}')
      where s.tenant_id = $1 and s.key = any($2)`,
    [tenantId, ACCOUNT_KEYS.map((k) => k.key)],
  );
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return ACCOUNT_KEYS.map(({ key, label }) => {
    const r = byKey.get(key);
    return { key, label, code: r?.code ?? null, account_name: r?.account_name ?? null, is_assumed: r?.is_assumed ?? true };
  });
}

export async function getReadiness(tenantId: string): Promise<ReadinessStatus> {
  const { rows } = await pool.query(
    `select fn_cost_config_status($1, (select id from service_lines where tenant_id=$1 and code='pest_control')) as s`,
    [tenantId],
  );
  const s = rows[0].s as { ready: boolean; unconfirmed: number; items: string[] };
  const { rows: jc } = await pool.query(
    `select count(*)::int n from jobs j
      where j.tenant_id=$1 and j.status='completed'
        and not exists (select 1 from job_cost_current c where c.job_id=j.id)`,
    [tenantId],
  );
  return { ready: s.ready, unconfirmed: s.unconfirmed, items: s.items ?? [], uncosted_jobs: jc[0].n };
}

const num = (v?: string) => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid number: "${t}"`);
  return n;
};

// Set a rate (service-line scoped). Confirming a real value clears ASSUMED.
async function setRate(tenantId: string, serviceLineId: string, key: string, value: string, confirm: boolean, note: string) {
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select value #>> '{}' as value, is_assumed from settings where tenant_id=$1 and service_line_id=$2 and key=$3 for update`, [tenantId, serviceLineId, key])).rows[0];
    await c.query(
      `insert into settings(tenant_id, service_line_id, key, value, is_assumed)
       values ($1,$2,$3,$4::jsonb, $5)
       on conflict (tenant_id, service_line_id, key) do update set value=excluded.value, is_assumed=excluded.is_assumed, updated_at=now()`,
      [tenantId, serviceLineId, key, JSON.stringify(value), !confirm],
    );
    await audit(c, tenantId, { table: "settings", rowId: key, action: "update", oldValue: before, newValue: { value, is_assumed: !confirm }, note });
  });
}

export async function saveCostRates(
  tenantId: string,
  serviceLineId: string,
  d: { labour_rate?: string; overhead_enabled?: boolean; overhead_rate?: string; vehicle_rate?: string },
): Promise<void> {
  if (d.labour_rate !== undefined) {
    const v = num(d.labour_rate);
    await setRate(tenantId, serviceLineId, RATE_KEYS.labour, String(v ?? 0), v != null && v > 0, "standard labour rate set");
  }
  if (d.vehicle_rate !== undefined) {
    const v = num(d.vehicle_rate);
    await setRate(tenantId, serviceLineId, RATE_KEYS.vehicle, String(v ?? 0), v != null && v > 0, "standard vehicle rate set");
  }
  if (d.overhead_enabled !== undefined) {
    await setRate(tenantId, serviceLineId, RATE_KEYS.overheadEnabled, d.overhead_enabled ? "true" : "false", true, "overhead toggle set");
  }
  if (d.overhead_rate !== undefined) {
    const v = num(d.overhead_rate);
    await setRate(tenantId, serviceLineId, RATE_KEYS.overheadRate, String(v ?? 0), v != null && v > 0, "overhead rate set");
  }
}

// Confirm/edit a GL account: optionally change code+name, then clear ASSUMED. If
// the code changes, the settings mapping is updated in the same transaction so it
// stays consistent.
export async function confirmCostAccount(
  tenantId: string,
  settingKey: string,
  d: { code?: string; name?: string },
): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const cur = (await c.query(`select value #>> '{}' as code from settings where tenant_id=$1 and key=$2 for update`, [tenantId, settingKey])).rows[0];
    if (!cur) throw new Error("Account mapping not found");
    const oldCode = cur.code as string;
    const newCode = (d.code ?? oldCode).trim() || oldCode;
    const acct = (await c.query(`select id, code, name, is_assumed from accounts where tenant_id=$1 and code=$2 for update`, [tenantId, oldCode])).rows[0];
    if (!acct) throw new Error(`Account ${oldCode} not found`);
    if (newCode !== oldCode) {
      const clash = await c.query(`select 1 from accounts where tenant_id=$1 and code=$2`, [tenantId, newCode]);
      if (clash.rowCount) throw new Error(`Account code ${newCode} already exists`);
    }
    await c.query(`update accounts set code=$1, name=coalesce($2,name), is_assumed=false, confirmed_at=now() where id=$3`,
      [newCode, d.name?.trim() || null, acct.id]);
    if (newCode !== oldCode) {
      await c.query(`update settings set value=$1::jsonb, is_assumed=false, updated_at=now() where tenant_id=$2 and key=$3`,
        [JSON.stringify(newCode), tenantId, settingKey]);
    } else {
      await c.query(`update settings set is_assumed=false, updated_at=now() where tenant_id=$1 and key=$2`, [tenantId, settingKey]);
    }
    await audit(c, tenantId, {
      table: "accounts", rowId: acct.id, action: "confirm",
      oldValue: { code: oldCode, name: acct.name, is_assumed: acct.is_assumed },
      newValue: { code: newCode, name: d.name ?? acct.name, is_assumed: false },
      note: `GL account confirmed via cost setup (${settingKey})`,
    });
  });
}

// The unlock action: cost every completed job that has no current cost.
export async function runBacklog(tenantId: string): Promise<{ costed: number; blocked: number }> {
  const { rows } = await pool.query(`select fn_cost_jobs_backlog($1, 1000) as r`, [tenantId]);
  return rows[0].r as { costed: number; blocked: number };
}
