import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Generic admin CRUD for the simple reference catalogues (code / name /
// description + is_active). These are config data: "archive" = deactivate
// (is_active=false), the FK-safe soft-delete — history keeps resolving, the row
// drops out of new-work pickers. Nothing is hard-deleted; every write is audited.
//
// SAFETY: the catalogue key is validated against CATALOGS before any table name
// is interpolated, so table identifiers are always internal literals, never user
// input (same model as reference.ts).

export type CatalogKey = "service_types" | "job_types" | "facility_types" | "job_sources";

export const CATALOGS: Record<CatalogKey, { label: string; singular: string; hasDescription: boolean }> = {
  service_types:  { label: "Service types",  singular: "service type",  hasDescription: true },
  job_types:      { label: "Job types",      singular: "job type",      hasDescription: true },
  facility_types: { label: "Facility types", singular: "facility type", hasDescription: true },
  job_sources:    { label: "Job sources",    singular: "job source",    hasDescription: false },
};

export interface CatalogItem {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_assumed: boolean;
  assumed_note: string | null;
}

export interface CatalogInput {
  code?: string;
  name?: string;
  description?: string;
}

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

function cfg(key: CatalogKey) {
  const c = CATALOGS[key];
  if (!c) throw new Error("Unknown catalogue");
  return c;
}

export async function listCatalog(tenantId: string, key: CatalogKey, includeArchived = false): Promise<CatalogItem[]> {
  const c = cfg(key);
  const descCol = c.hasDescription ? "description" : "null::text as description";
  const { rows } = await scopedRead(tenantId,
    `select id, code, name, ${descCol}, is_active, is_assumed, assumed_note
       from ${key} where tenant_id = $1 and ($2 or is_active)
      order by is_active desc, name`,
    [tenantId, includeArchived],
  );
  return rows as CatalogItem[];
}

export async function createCatalogItem(tenantId: string, serviceLineId: string, key: CatalogKey, d: CatalogInput): Promise<string> {
  const c = cfg(key);
  if (!clean(d.code)) throw new Error("A code is required");
  if (!clean(d.name)) throw new Error("A name is required");
  return withTenantTx(tenantId, async (client) => {
    const cols = c.hasDescription
      ? `(tenant_id, service_line_id, code, name, description, is_assumed)`
      : `(tenant_id, service_line_id, code, name, is_assumed)`;
    const vals = c.hasDescription ? `($1,$2,$3,$4,$5,false)` : `($1,$2,$3,$4,false)`;
    const params = c.hasDescription
      ? [tenantId, serviceLineId, clean(d.code), (d.name ?? "").trim(), clean(d.description)]
      : [tenantId, serviceLineId, clean(d.code), (d.name ?? "").trim()];
    const { rows } = await client.query(`insert into ${key} ${cols} values ${vals} returning id`, params);
    await audit(client, tenantId, {
      table: key, rowId: rows[0].id, action: "insert", newValue: d, note: `${c.singular} created in admin console`,
    });
    return rows[0].id as string;
  });
}

export async function updateCatalogItem(tenantId: string, key: CatalogKey, id: string, d: CatalogInput): Promise<void> {
  const c = cfg(key);
  if (!clean(d.code)) throw new Error("A code is required");
  if (!clean(d.name)) throw new Error("A name is required");
  await withTenantTx(tenantId, async (client) => {
    const selCols = c.hasDescription ? "code, name, description, is_assumed" : "code, name, is_assumed";
    const before = (await client.query(`select ${selCols} from ${key} where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error(`${c.singular} not found`);
    const setClause = c.hasDescription
      ? `code=$1, name=$2, description=$3 ${before.is_assumed ? ", is_assumed=false, confirmed_at=now()" : ""} where id=$4`
      : `code=$1, name=$2 ${before.is_assumed ? ", is_assumed=false, confirmed_at=now()" : ""} where id=$3`;
    const params = c.hasDescription
      ? [clean(d.code), (d.name ?? "").trim(), clean(d.description), id]
      : [clean(d.code), (d.name ?? "").trim(), id];
    await client.query(`update ${key} set ${setClause}`, params);
    await audit(client, tenantId, { table: key, rowId: id, action: "update", oldValue: before, newValue: d, note: `${c.singular} edited in admin console` });
  });
}

export async function archiveCatalogItem(tenantId: string, key: CatalogKey, id: string): Promise<void> {
  const c = cfg(key);
  await withTenantTx(tenantId, async (client) => {
    const r = await client.query(`update ${key} set is_active=false where id=$1 and tenant_id=$2 and is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(client, tenantId, { table: key, rowId: id, action: "update", oldValue: { is_active: true }, newValue: { is_active: false }, note: `${c.singular} archived (deactivated)` });
  });
}

export async function restoreCatalogItem(tenantId: string, key: CatalogKey, id: string): Promise<void> {
  const c = cfg(key);
  await withTenantTx(tenantId, async (client) => {
    const r = await client.query(`update ${key} set is_active=true where id=$1 and tenant_id=$2 and not is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(client, tenantId, { table: key, rowId: id, action: "update", oldValue: { is_active: false }, newValue: { is_active: true }, note: `${c.singular} restored (reactivated)` });
  });
}
