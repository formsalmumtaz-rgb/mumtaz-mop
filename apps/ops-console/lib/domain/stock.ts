import "server-only";
import { scopedRead, withRequest } from "../rls";
import { audit } from "./audit";

// Stock on hand + warehouse→van issue (Release 1 item 5, spec Part E).
//
// The substrate has existed since mig 007/016 — stock_locations (warehouse/van/site),
// append-only stock_movements with movement_type='transfer', per-batch frozen cost,
// and the batch_stock_on_hand view — but 'transfer' had no producer in any layer
// above SQL and on-hand was never shown. This module is that producer.
//
// Invariant posture: stock_movements is APPEND-ONLY; a transfer is INSERT-only
// (one row per batch, from→to, batch identity preserved so FEFO and traceability
// hold). Never UPDATE/DELETE. Runs under withRequest (mop_app, RLS live).

export interface OnHandRow {
  location_id: string;
  location_code: string | null;
  location_name: string;
  location_type: string;
  item_id: string;
  item_name: string;
  base_unit: string | null;
  batch_id: string;
  batch_no: string | null;
  expiry_date: string | null;
  qty_base: number;
}

export async function listOnHand(tenantId: string): Promise<OnHandRow[]> {
  const { rows } = await scopedRead(tenantId,
    `select oh.location_id, sl.code as location_code, sl.name as location_name, sl.location_type,
            oh.item_id, it.name as item_name, u.code as base_unit,
            oh.batch_id, b.batch_no, b.expiry_date::text as expiry_date,
            oh.qty_base::float8 as qty_base
       from batch_stock_on_hand oh
       join stock_locations sl on sl.id = oh.location_id
       join items it on it.id = oh.item_id
       left join units u on u.id = it.base_unit_id
       left join item_batches b on b.id = oh.batch_id
      where oh.tenant_id = $1 and oh.qty_base > 0
      order by sl.location_type, sl.name, it.name, b.expiry_date nulls last`,
    [tenantId],
  );
  return rows as OnHandRow[];
}

export interface StockLocation { id: string; code: string | null; name: string; location_type: string }

export async function listLocations(tenantId: string): Promise<StockLocation[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, code, name, location_type from stock_locations
      where tenant_id = $1 order by location_type, name`, [tenantId]);
  return rows as StockLocation[];
}

export interface TransferableItem { id: string; name: string; base_unit: string | null }

export async function listTransferableItems(tenantId: string): Promise<TransferableItem[]> {
  const { rows } = await scopedRead(tenantId,
    `select distinct it.id, it.name, u.code as base_unit
       from batch_stock_on_hand oh
       join items it on it.id = oh.item_id
       left join units u on u.id = it.base_unit_id
      where oh.tenant_id = $1 and oh.qty_base > 0
      order by it.name`, [tenantId]);
  return rows as TransferableItem[];
}

// Issue stock between locations, FEFO across batches (earliest expiry first, then
// oldest batch), one INSERT per batch drawn. Throws when the source location does
// not hold enough — nothing is written in that case (single transaction).
export async function transferStock(
  tenantId: string, actorId: string | null,
  d: { itemId: string; fromLocationId: string; toLocationId: string; qtyBase: number; note?: string },
): Promise<{ batches: number }> {
  if (!(d.qtyBase > 0)) throw new Error("Quantity must be positive");
  if (d.fromLocationId === d.toLocationId) throw new Error("From and to locations are the same");
  return withRequest({ tenantId, actorId }, async (c) => {
    const { rows: item } = await c.query(
      `select id, service_line_id, base_unit_id, name from items where tenant_id = $1 and id = $2`,
      [tenantId, d.itemId]);
    if (!item[0]) throw new Error("Item not found");

    // FEFO over what the source location actually holds, inside the transaction.
    const { rows: batches } = await c.query(
      `select oh.batch_id, oh.qty_base::numeric as qty, b.expiry_date
         from batch_stock_on_hand oh
         left join item_batches b on b.id = oh.batch_id
        where oh.tenant_id = $1 and oh.item_id = $2 and oh.location_id = $3 and oh.qty_base > 0
        order by b.expiry_date asc nulls last, b.created_at asc`,
      [tenantId, d.itemId, d.fromLocationId]);

    const available = batches.reduce((s: number, b: { qty: string }) => s + Number(b.qty), 0);
    if (available < d.qtyBase) {
      throw new Error(`Insufficient stock: ${available} available at source, ${d.qtyBase} requested`);
    }

    let remaining = d.qtyBase;
    let used = 0;
    for (const b of batches as { batch_id: string; qty: string }[]) {
      if (remaining <= 0) break;
      const take = Math.min(Number(b.qty), remaining);
      await c.query(
        `insert into stock_movements
           (tenant_id, service_line_id, item_id, batch_id, from_location_id, to_location_id,
            movement_type, quantity, unit_id, snapshot, created_by)
         values ($1,$2,$3,$4,$5,$6,'transfer',$7,$8,$9,$10)`,
        [tenantId, item[0].service_line_id, d.itemId, b.batch_id, d.fromLocationId, d.toLocationId,
         take, item[0].base_unit_id,
         JSON.stringify({ reason: "issue", note: d.note ?? null }), actorId]);
      remaining -= take;
      used += 1;
    }
    await audit(c, tenantId, {
      table: "stock_movements", rowId: d.itemId, action: "insert",
      newValue: { item: item[0].name, from: d.fromLocationId, to: d.toLocationId, qty_base: d.qtyBase, batches: used },
      note: "stock issued (transfer, FEFO)",
    });
    return { batches: used };
  });
}

// Low stock (refresh item 5): total on-hand per item vs items.reorder_level.
export interface LowStockRow { item_id: string; item_name: string; base_unit: string | null; total_base: number; reorder_level: number }
export async function listLowStock(tenantId: string): Promise<LowStockRow[]> {
  const { rows } = await scopedRead(tenantId,
    `select it.id as item_id, it.name as item_name, u.code as base_unit,
            coalesce(sum(oh.qty_base), 0)::float8 as total_base, it.reorder_level::float8 as reorder_level
       from items it
       left join units u on u.id = it.base_unit_id
       left join batch_stock_on_hand oh on oh.item_id = it.id and oh.tenant_id = it.tenant_id
      where it.tenant_id = $1 and it.is_active and it.reorder_level is not null
      group by it.id, it.name, u.code, it.reorder_level
     having coalesce(sum(oh.qty_base), 0) <= it.reorder_level
      order by it.name`, [tenantId]);
  return rows as LowStockRow[];
}
