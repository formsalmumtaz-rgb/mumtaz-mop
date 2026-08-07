import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Vehicle master + ownership/depreciation (mig 022/025). Depreciation (company-
// owned) / lease (leased-rented) is MANAGEMENT ACCOUNTING ONLY — it is never
// written to job_costs and never affects operational profitability. This screen
// only sets the per-vehicle values that fn_management_profit consumes.
// Vehicles are mutable (no versioning); the audit log is the change history.

export interface Vehicle {
  id: string;
  code: string | null;
  name: string | null;
  registration_plate: string | null;
  ownership_type: string;
  monthly_depreciation: string | null;
  monthly_lease_cost: string | null;
  monthly_fixed_cost: string | null;
  technician_id: string | null;
  technician_name: string | null;
  is_active: boolean;
  is_assumed: boolean;
  assumed_note: string | null;
  archived_at?: string | null;
}

export async function listVehicles(tenantId: string, includeArchived = false): Promise<Vehicle[]> {
  const { rows } = await scopedRead(tenantId,
    `select v.id, v.code, v.name, v.registration_plate, v.ownership_type,
            v.monthly_depreciation::text, v.monthly_lease_cost::text, v.monthly_fixed_cost::text,
            v.technician_id, coalesce(t.full_name, t.code) as technician_name,
            v.is_active, v.is_assumed, v.assumed_note, v.archived_at::text
       from vehicles v
       left join technicians t on t.id = v.technician_id
      where v.tenant_id = $1 and ($2 or v.archived_at is null)
      order by v.archived_at nulls first, v.code, v.name`,
    [tenantId, includeArchived],
  );
  return rows as Vehicle[];
}

export async function archiveVehicle(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update vehicles set archived_at=now(), archived_by=app_current_actor() where id=$1 and tenant_id=$2 and archived_at is null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "vehicles", rowId: id, action: "update", newValue: { archived: true }, note: "vehicle archived" });
  });
}

export async function restoreVehicle(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update vehicles set archived_at=null, archived_by=null where id=$1 and tenant_id=$2 and archived_at is not null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "vehicles", rowId: id, action: "update", newValue: { archived: false }, note: "vehicle restored" });
  });
}

export async function getDefaultMonthlyDepreciation(tenantId: string): Promise<string | null> {
  const { rows } = await scopedRead(tenantId, 
    `select value #>> '{}' as v from settings where tenant_id=$1 and key='cost.default_monthly_depreciation' limit 1`,
    [tenantId],
  );
  return rows[0]?.v ?? null;
}

export interface VehicleInput {
  code?: string;
  name?: string;
  registration_plate?: string;
  ownership_type?: string;
  monthly_depreciation?: string;
  monthly_lease_cost?: string;
  technician_id?: string;
}

const OWNERSHIP = new Set(["company_owned", "leased", "rented"]);
const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};
// Validate a money value: not negative, and a sane upper bound to catch typos.
const money = (v: string | undefined, label: string): number | null => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`${label}: not a number`);
  if (n < 0) throw new Error(`${label}: cannot be negative`);
  if (n > 1_000_000) throw new Error(`${label}: ${n} looks wrong (max 1,000,000/month)`);
  return n;
};

// Only the cost relevant to the ownership type is kept; the other is cleared, so
// monthly_fixed_cost (generated) reflects the chosen model unambiguously.
function normaliseCosts(ownership: string, d: VehicleInput) {
  const dep = money(d.monthly_depreciation, "Monthly depreciation");
  const lease = money(d.monthly_lease_cost, "Monthly lease/rental");
  if (ownership === "company_owned") return { dep, lease: null };
  return { dep: null, lease };
}

export async function createVehicle(tenantId: string, serviceLineId: string, d: VehicleInput): Promise<string> {
  const ownership = d.ownership_type ?? "company_owned";
  if (!OWNERSHIP.has(ownership)) throw new Error("Invalid ownership type");
  if (!clean(d.code) && !clean(d.name)) throw new Error("A code or name is required");
  const { dep, lease } = normaliseCosts(ownership, d);
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into vehicles (tenant_id, service_line_id, code, name, registration_plate,
          ownership_type, monthly_depreciation, monthly_lease_cost, technician_id, is_assumed)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false) returning id`,
      [tenantId, serviceLineId, clean(d.code), clean(d.name), clean(d.registration_plate),
       ownership, dep, lease, clean(d.technician_id)],
    );
    await audit(c, tenantId, {
      table: "vehicles", rowId: rows[0].id, action: "insert",
      newValue: { ...d, ownership_type: ownership }, note: "vehicle created in admin console",
    });
    return rows[0].id as string;
  });
}

export async function updateVehicle(tenantId: string, id: string, d: VehicleInput): Promise<void> {
  const ownership = d.ownership_type ?? "company_owned";
  if (!OWNERSHIP.has(ownership)) throw new Error("Invalid ownership type");
  const { dep, lease } = normaliseCosts(ownership, d);
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(
      `select code, name, registration_plate, ownership_type, monthly_depreciation::text, monthly_lease_cost::text, technician_id
         from vehicles where id=$1 and tenant_id=$2 for update`, [id, tenantId],
    )).rows[0];
    if (!before) throw new Error("Vehicle not found");
    await c.query(
      `update vehicles set code=$1, name=$2, registration_plate=$3, ownership_type=$4,
              monthly_depreciation=$5, monthly_lease_cost=$6, technician_id=$7 where id=$8`,
      [clean(d.code), clean(d.name), clean(d.registration_plate), ownership, dep, lease, clean(d.technician_id), id],
    );
    await audit(c, tenantId, {
      table: "vehicles", rowId: id, action: "update",
      oldValue: before, newValue: { ...d, ownership_type: ownership }, note: "vehicle edited in admin console",
    });
  });
}
