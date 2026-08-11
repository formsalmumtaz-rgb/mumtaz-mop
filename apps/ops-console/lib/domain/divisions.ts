import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Divisions (service lines) managed from admin — adding a division is
// CONFIGURATION, not a deployment (Art. XVIII). A new division starts empty; it
// is then configured through the (division-aware) admin: service types,
// categories, pricing models, frequencies, BOM. Deactivating a division hides it
// from the switcher and new-work pickers; history keeps resolving.
export interface Division {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_assumed: boolean;
  category_count: number;
  service_type_count: number;
}

const CODE_RE = /^[a-z][a-z0-9_]{1,40}$/;

export async function listDivisions(tenantId: string): Promise<Division[]> {
  const { rows } = await scopedRead(tenantId,
    `select sl.id, sl.code, sl.name, sl.is_active, sl.is_assumed,
            (select count(*)::int from service_categories c where c.service_line_id=sl.id and c.is_active) as category_count,
            (select count(*)::int from service_types t where t.service_line_id=sl.id and t.is_active) as service_type_count
       from service_lines sl where sl.tenant_id=$1
      order by sl.is_active desc, sl.name`,
    [tenantId]);
  return rows as Division[];
}

export async function createDivision(tenantId: string, code: string, name: string): Promise<string> {
  const c = (code ?? "").trim().toLowerCase();
  const n = (name ?? "").trim();
  if (!CODE_RE.test(c)) throw new Error("Code must be lowercase letters/numbers/underscores, starting with a letter (e.g. hvac, ac_duct)");
  if (!n) throw new Error("Name is required");
  return withTenantTx(tenantId, async (client) => {
    const dup = await client.query(`select 1 from service_lines where tenant_id=$1 and code=$2`, [tenantId, c]);
    if (dup.rowCount) throw new Error(`A division with code "${c}" already exists`);
    const { rows } = await client.query(
      `insert into service_lines (tenant_id, code, name, is_active) values ($1,$2,$3,true) returning id`,
      [tenantId, c, n]);
    await audit(client, tenantId, { table: "service_lines", rowId: rows[0].id, action: "insert", newValue: { code: c, name: n }, note: "division created in admin console" });
    return rows[0].id as string;
  });
}

export async function updateDivision(tenantId: string, id: string, name: string): Promise<void> {
  const n = (name ?? "").trim();
  if (!n) throw new Error("Name is required");
  await withTenantTx(tenantId, async (client) => {
    const before = (await client.query(`select name, is_assumed from service_lines where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Division not found");
    await client.query(`update service_lines set name=$1 ${before.is_assumed ? ", is_assumed=false, confirmed_at=now()" : ""} where id=$2`, [n, id]);
    await audit(client, tenantId, { table: "service_lines", rowId: id, action: "update", oldValue: { name: before.name }, newValue: { name: n }, note: "division renamed" });
  });
}

export async function setDivisionActive(tenantId: string, id: string, active: boolean): Promise<void> {
  await withTenantTx(tenantId, async (client) => {
    if (!active) {
      const others = await client.query(`select count(*)::int as n from service_lines where tenant_id=$1 and is_active and id<>$2`, [tenantId, id]);
      if ((others.rows[0]?.n ?? 0) === 0) throw new Error("Cannot deactivate the only active division");
    }
    const r = await client.query(`update service_lines set is_active=$1 where id=$2 and tenant_id=$3 and is_active<>$1 returning id`, [active, id, tenantId]);
    if (r.rowCount) await audit(client, tenantId, { table: "service_lines", rowId: id, action: "update", newValue: { is_active: active }, note: active ? "division reactivated" : "division deactivated" });
  });
}
