import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Category → Material/Consumable BOM (mig 050). The STANDARD/ESTIMATED materials
// a category consumes per job. Items are service-line scoped, so a cleaning
// category can only reference cleaning items — pest-control chemical logic never
// leaks across divisions. Quantities are in the item's base unit and support
// partial units (0.25 of a gel tube). Cost is deterministic (fn_category_material_cost).
export interface BomLine {
  id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_type: string;
  unit_code: string | null;
  quantity: string;
  unit_cost: string;   // per base unit, from the latest purchase (0 if never purchased)
  line_cost: string;   // quantity × unit_cost
  notes: string | null;
}

export interface ItemOption { id: string; name: string; item_type: string; unit_code: string | null }

export async function listBom(tenantId: string, categoryId: string): Promise<{ lines: BomLine[]; total: string }> {
  const { rows } = await scopedRead(tenantId,
    `select sci.id, sci.item_id, i.name as item_name, i.code as item_code, i.item_type,
            u.code as unit_code, sci.quantity::text,
            fn_item_standard_cost($1, sci.item_id)::text as unit_cost,
            round(sci.quantity * fn_item_standard_cost($1, sci.item_id), 2)::text as line_cost,
            sci.notes
       from service_category_items sci
       join items i on i.id = sci.item_id
       left join units u on u.id = i.base_unit_id
      where sci.tenant_id = $1 and sci.service_category_id = $2 and sci.is_active
      order by i.item_type, i.name`,
    [tenantId, categoryId]);
  const { rows: t } = await scopedRead(tenantId,
    `select fn_category_material_cost($1, $2)::text as total`, [tenantId, categoryId]);
  return { lines: rows as BomLine[], total: t[0]?.total ?? "0" };
}

// Items eligible for a category's BOM: active chemicals/consumables/equipment in
// the same division (service line) as the category.
export async function listBomItemOptions(tenantId: string, categoryId: string): Promise<ItemOption[]> {
  const { rows } = await scopedRead(tenantId,
    `select i.id, i.name, i.item_type, u.code as unit_code
       from items i
       left join units u on u.id = i.base_unit_id
      where i.tenant_id = $1 and i.is_active
        and i.service_line_id = (select service_line_id from service_categories where id = $2 and tenant_id = $1)
      order by i.item_type, i.name`,
    [tenantId, categoryId]);
  return rows as ItemOption[];
}

export async function addBomLine(tenantId: string, categoryId: string, itemId: string, quantity: string, notes?: string): Promise<void> {
  const q = Number((quantity ?? "").trim());
  if (!Number.isFinite(q) || q <= 0) throw new Error("Quantity must be greater than 0");
  const n = (notes ?? "").trim() || null;
  await withTenantTx(tenantId, async (c) => {
    // Category + item must exist in the same tenant; item's division must match the category's (enforced by the option list, re-checked here).
    const ok = await c.query(
      `select 1 from service_categories sc join items i on i.tenant_id = sc.tenant_id
        where sc.id = $2 and i.id = $3 and sc.tenant_id = $1
          and (i.service_line_id = sc.service_line_id)`, [tenantId, categoryId, itemId]);
    if (!ok.rowCount) throw new Error("Item is not in this category's division");
    const { rows } = await c.query(
      `insert into service_category_items (tenant_id, service_category_id, item_id, quantity, notes)
       values ($1,$2,$3,$4,$5)
       on conflict (tenant_id, service_category_id, item_id)
         do update set quantity = excluded.quantity, notes = excluded.notes, is_active = true
       returning id`,
      [tenantId, categoryId, itemId, q, n]);
    await audit(c, tenantId, { table: "service_category_items", rowId: rows[0].id, action: "insert", newValue: { category_id: categoryId, item_id: itemId, quantity: q }, note: "category BOM line set" });
  });
}

export async function removeBomLine(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`delete from service_category_items where id=$1 and tenant_id=$2 returning service_category_id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "service_category_items", rowId: id, action: "soft_delete", note: "category BOM line removed" });
  });
}
