import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

export interface Branch {
  id: string;
  code: string | null;
  name: string | null;
  address: string | null;
  emirate: string | null;
  facility_type_id: string | null;
  facility_type_name: string | null;
  lat: number | null;
  lng: number | null;
  archived_at?: string | null;
}

export interface BranchInput {
  name?: string;
  address?: string;
  emirate?: string;
  facility_type_id?: string;
  lat?: number | null;
  lng?: number | null;
}

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function listBranches(tenantId: string, customerId: string, includeArchived = false): Promise<Branch[]> {
  const { rows } = await scopedRead(tenantId,
    `select b.id, b.code, b.name, b.address, b.emirate, b.facility_type_id,
            f.name as facility_type_name,
            ST_Y(b.location::geometry) as lat, ST_X(b.location::geometry) as lng,
            b.archived_at::text
       from customer_branches b
       left join facility_types f on f.id = b.facility_type_id
      where b.tenant_id = $1 and b.customer_id = $2 and ($3 or b.archived_at is null)
      order by b.archived_at nulls first, b.created_at`,
    [tenantId, customerId, includeArchived],
  );
  return rows as Branch[];
}

export async function createBranch(
  tenantId: string,
  serviceLineId: string,
  customerId: string,
  data: BranchInput,
): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    const { rows: cnt } = await c.query(`select count(*)::int n from customer_branches where tenant_id=$1`, [tenantId]);
    const code = "BR-" + String(cnt[0].n + 1).padStart(4, "0");
    const lat = data.lat ?? null;
    const lng = data.lng ?? null;
    const { rows } = await c.query(
      `insert into customer_branches
         (tenant_id, service_line_id, customer_id, code, name, address, emirate, facility_type_id, location)
       values ($1,$2,$3,$4,$5,$6,$7,$8,
         case when $9::float8 is null or $10::float8 is null then null
              else ST_SetSRID(ST_MakePoint($9,$10),4326)::geography end)
       returning id`,
      [tenantId, serviceLineId, customerId, code, clean(data.name), clean(data.address),
       clean(data.emirate), clean(data.facility_type_id), lng, lat],
    );
    await audit(c, tenantId, {
      table: "customer_branches", rowId: rows[0].id, action: "insert",
      newValue: { code, name: data.name, address: data.address, lat, lng },
      note: "branch created in admin console",
    });
    return rows[0].id as string;
  });
}

// Full edit. The GPS pin is only rewritten when a fresh lat/lng is supplied, so a
// plain detail edit never wipes an existing pin.
export async function updateBranch(tenantId: string, id: string, data: BranchInput): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(
      `select code, name, address, emirate, facility_type_id,
              ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
         from customer_branches where id=$1 and tenant_id=$2 for update`, [id, tenantId],
    )).rows[0];
    if (!before) throw new Error("Branch not found");
    const setPin = data.lat != null && data.lng != null;
    await c.query(
      `update customer_branches
          set name=$1, address=$2, emirate=$3, facility_type_id=$4
              ${setPin ? ", location = ST_SetSRID(ST_MakePoint($5,$6),4326)::geography" : ""}
        where id=${setPin ? "$7" : "$5"}`,
      setPin
        ? [clean(data.name), clean(data.address), clean(data.emirate), clean(data.facility_type_id), data.lng, data.lat, id]
        : [clean(data.name), clean(data.address), clean(data.emirate), clean(data.facility_type_id), id],
    );
    await audit(c, tenantId, {
      table: "customer_branches", rowId: id, action: "update",
      oldValue: before,
      newValue: { ...data, ...(setPin ? {} : { lat: before.lat, lng: before.lng }) },
      note: setPin ? "branch edited (pin updated)" : "branch edited in admin console",
    });
  });
}

export async function archiveBranch(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update customer_branches set archived_at=now(), archived_by=app_current_actor() where id=$1 and tenant_id=$2 and archived_at is null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "customer_branches", rowId: id, action: "update", newValue: { archived: true }, note: "branch archived" });
  });
}

export async function restoreBranch(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update customer_branches set archived_at=null, archived_by=null where id=$1 and tenant_id=$2 and archived_at is not null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "customer_branches", rowId: id, action: "update", newValue: { archived: false }, note: "branch restored" });
  });
}
