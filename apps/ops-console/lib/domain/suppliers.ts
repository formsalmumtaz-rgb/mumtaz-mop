import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Suppliers — simple reference data, created inline from the purchase screen.
export interface Supplier {
  id: string;
  code: string | null;
  name: string;
  trn: string | null;
  is_assumed: boolean;
  assumed_note: string | null;
  is_active: boolean;
}

export async function listSuppliers(tenantId: string, includeArchived = false): Promise<Supplier[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, code, name, trn, is_assumed, assumed_note, is_active
       from suppliers where tenant_id = $1 and ($2 or is_active)
      order by is_active desc, name`,
    [tenantId, includeArchived],
  );
  return rows as Supplier[];
}

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function createSupplier(
  tenantId: string,
  serviceLineId: string,
  d: { name: string; code?: string; trn?: string },
): Promise<string> {
  if (!d.name?.trim()) throw new Error("Supplier name is required");
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into suppliers (tenant_id, service_line_id, code, name, trn, is_assumed)
       values ($1,$2,$3,$4,$5,false) returning id`,
      [tenantId, serviceLineId, clean(d.code), d.name.trim(), clean(d.trn)],
    );
    await audit(c, tenantId, {
      table: "suppliers", rowId: rows[0].id, action: "insert",
      newValue: d, note: "supplier created in admin console",
    });
    return rows[0].id as string;
  });
}

export async function updateSupplier(
  tenantId: string,
  id: string,
  d: { name: string; code?: string; trn?: string },
): Promise<void> {
  if (!d.name?.trim()) throw new Error("Supplier name is required");
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select code, name, trn, is_assumed from suppliers where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Supplier not found");
    await c.query(
      `update suppliers set code=$1, name=$2, trn=$3 ${before.is_assumed ? ", is_assumed=false, confirmed_at=now()" : ""} where id=$4`,
      [clean(d.code), d.name.trim(), clean(d.trn), id],
    );
    await audit(c, tenantId, { table: "suppliers", rowId: id, action: "update", oldValue: before, newValue: d, note: "supplier edited in admin console" });
  });
}

export async function archiveSupplier(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update suppliers set is_active=false where id=$1 and tenant_id=$2 and is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "suppliers", rowId: id, action: "update", oldValue: { is_active: true }, newValue: { is_active: false }, note: "supplier archived (deactivated)" });
  });
}

export async function restoreSupplier(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update suppliers set is_active=true where id=$1 and tenant_id=$2 and not is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "suppliers", rowId: id, action: "update", oldValue: { is_active: false }, newValue: { is_active: true }, note: "supplier restored (reactivated)" });
  });
}
