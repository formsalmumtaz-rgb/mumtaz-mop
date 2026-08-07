import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Chemical master (item_type='chemical'). Recipe/descriptor fields live on the
// item master (mig 016) + reorder level (mig 017). All writes are audit-logged.
export interface Item {
  id: string;
  code: string | null;
  name: string;
  base_unit_id: string | null;
  base_unit_code: string | null;
  active_ingredient: string | null;
  intended_service_type_ids: string[];
  is_recurring_stock: boolean;
  shelf_life_days: number | null;
  reorder_level: string | null;
  is_assumed: boolean;
  assumed_note: string | null;
  confirmed_at: string | null;
  is_active: boolean;
  archived_at?: string | null;
}

export interface ItemInput {
  name: string;
  code?: string;
  base_unit_id?: string;
  active_ingredient?: string;
  intended_service_type_ids?: string[];
  is_recurring_stock?: boolean;
  shelf_life_days?: string;
  reorder_level?: string;
}

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};
const num = (v?: string) => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`Not a number: "${t}"`);
  return n;
};

export async function listItems(tenantId: string, includeArchived = false): Promise<Item[]> {
  const { rows } = await scopedRead(tenantId,
    `select i.id, i.code, i.name, i.base_unit_id, u.code as base_unit_code,
            i.active_ingredient, i.intended_service_type_ids, i.is_recurring_stock,
            i.shelf_life_days, i.reorder_level::text as reorder_level,
            i.is_assumed, i.assumed_note, i.confirmed_at, i.is_active, i.archived_at::text
       from items i
       left join units u on u.id = i.base_unit_id
      where i.tenant_id = $1 and i.item_type = 'chemical' and ($2 or i.archived_at is null)
      order by i.archived_at nulls first, i.name`,
    [tenantId, includeArchived],
  );
  return rows as Item[];
}

export async function archiveItem(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update items set archived_at=now(), archived_by=app_current_actor() where id=$1 and tenant_id=$2 and archived_at is null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "items", rowId: id, action: "update", newValue: { archived: true }, note: "item archived" });
  });
}

export async function restoreItem(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update items set archived_at=null, archived_by=null where id=$1 and tenant_id=$2 and archived_at is not null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "items", rowId: id, action: "update", newValue: { archived: false }, note: "item restored" });
  });
}

export async function createItem(tenantId: string, serviceLineId: string, d: ItemInput): Promise<string> {
  if (!d.name?.trim()) throw new Error("Name is required");
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into items
         (tenant_id, service_line_id, code, name, item_type, base_unit_id, active_ingredient,
          intended_service_type_ids, is_recurring_stock, shelf_life_days, reorder_level, is_assumed)
       values ($1,$2,$3,$4,'chemical',$5,$6,$7,$8,$9,$10,false)
       returning id`,
      [
        tenantId, serviceLineId, clean(d.code), d.name.trim(), clean(d.base_unit_id),
        clean(d.active_ingredient), d.intended_service_type_ids ?? [], d.is_recurring_stock ?? false,
        num(d.shelf_life_days), num(d.reorder_level),
      ],
    );
    await audit(c, tenantId, {
      table: "items", rowId: rows[0].id, action: "insert",
      newValue: d, note: "chemical created in admin console",
    });
    return rows[0].id as string;
  });
}

export async function updateItem(tenantId: string, id: string, d: ItemInput): Promise<void> {
  if (!d.name?.trim()) throw new Error("Name is required");
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `select name, active_ingredient, reorder_level::text as reorder_level, is_recurring_stock, shelf_life_days
         from items where id = $1 and tenant_id = $2 and item_type = 'chemical' for update`,
      [id, tenantId],
    );
    if (!rows[0]) throw new Error("Chemical not found");
    const before = rows[0];
    await c.query(
      `update items set name=$1, base_unit_id=$2, active_ingredient=$3, intended_service_type_ids=$4,
              is_recurring_stock=$5, shelf_life_days=$6, reorder_level=$7 where id=$8`,
      [
        d.name.trim(), clean(d.base_unit_id), clean(d.active_ingredient), d.intended_service_type_ids ?? [],
        d.is_recurring_stock ?? false, num(d.shelf_life_days), num(d.reorder_level), id,
      ],
    );
    await audit(c, tenantId, {
      table: "items", rowId: id, action: "update",
      oldValue: before, newValue: d, note: "chemical edited in admin console",
    });
  });
}

// Confirm an ASSUMED chemical as-is (clears the flag, audit-logged).
export async function confirmItem(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `select is_assumed from items where id=$1 and tenant_id=$2 for update`, [id, tenantId],
    );
    if (!rows[0]) throw new Error("Chemical not found");
    if (!rows[0].is_assumed) return;
    await c.query(`update items set is_assumed=false, confirmed_at=now() where id=$1`, [id]);
    await audit(c, tenantId, {
      table: "items", rowId: id, action: "confirm",
      oldValue: { is_assumed: true }, newValue: { is_assumed: false },
      note: "ASSUMED value confirmed in admin console",
    });
  });
}
