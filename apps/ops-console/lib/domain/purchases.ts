import "server-only";
import { recordPurchase, drainOnce, consumers } from "@mop/worker";
import { pool } from "../db";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Goods-receipt logging. Delegates the ledger + batch + movement to the worker's
// recordPurchase (perpetual inventory: Dr Inventory / Cr Payable, frozen batch
// cost) inside the tenant transaction, then audit-logs and drains the emitted
// purchase.recorded event.

export interface StockLocation {
  id: string;
  code: string | null;
  name: string;
  location_type: string;
  is_assumed: boolean;
}

export async function listStockLocations(tenantId: string): Promise<StockLocation[]> {
  const { rows } = await pool.query(
    `select id, code, name, location_type, is_assumed
       from stock_locations where tenant_id = $1 and is_active
      order by case location_type when 'warehouse' then 0 when 'van' then 1 else 2 end, name`,
    [tenantId],
  );
  return rows as StockLocation[];
}

export interface PurchaseRow {
  id: string;
  purchase_date: string;
  item_name: string;
  supplier_name: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  pack_quantity: string;
  pack_size: string;
  pack_unit_code: string | null;
  base_unit_code: string | null;
  total_cost: string;
  currency: string;
  unit_cost: string;
  reference_no: string | null;
}

export async function listPurchases(tenantId: string, limit = 50): Promise<PurchaseRow[]> {
  const { rows } = await pool.query(
    `select p.id, p.purchase_date::text as purchase_date, i.name as item_name, s.name as supplier_name,
            b.batch_no, b.expiry_date::text as expiry_date,
            p.pack_quantity::text as pack_quantity, p.pack_size::text as pack_size,
            pu.code as pack_unit_code, bu.code as base_unit_code,
            p.total_cost::text as total_cost, p.currency, p.unit_cost::text as unit_cost, p.reference_no
       from item_purchases p
       join items i on i.id = p.item_id
       left join suppliers s on s.id = p.supplier_id
       left join item_batches b on b.id = p.batch_id
       left join units pu on pu.id = p.pack_unit_id
       left join units bu on bu.id = p.base_unit_id
      where p.tenant_id = $1
      order by p.created_at desc
      limit $2`,
    [tenantId, limit],
  );
  return rows as PurchaseRow[];
}

export interface LogPurchaseInput {
  itemId: string;
  supplierId?: string;
  batchNo?: string;
  expiryDate?: string;
  packQuantity: string;
  packSize: string;
  packUnitId: string;
  baseUnitId?: string;
  totalCost: string;
  currency?: string;
  toLocationId?: string;
  paymentMode?: "payable" | "cash";
  referenceNo?: string;
}

const req = (v: string | undefined, label: string): string => {
  const t = (v ?? "").trim();
  if (t === "") throw new Error(`${label} is required`);
  return t;
};
const pos = (v: string | undefined, label: string): number => {
  const n = Number(req(v, label));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be greater than zero`);
  return n;
};

export async function logPurchase(
  tenantId: string,
  serviceLineId: string,
  d: LogPurchaseInput,
): Promise<{ purchaseId: string; batchId: string; unitCost: number; totalBaseQuantity: number }> {
  const itemId = req(d.itemId, "Chemical");
  const packUnitId = req(d.packUnitId, "Unit");
  const packQuantity = pos(d.packQuantity, "Quantity");
  const packSize = pos(d.packSize, "Unit size");
  const totalCost = Number(req(d.totalCost, "Total cost"));
  if (!Number.isFinite(totalCost) || totalCost < 0) throw new Error("Total cost must be zero or more");

  const res = await withTenantTx(tenantId, async (c) => {
    const r = await recordPurchase(c, {
      tenantId,
      serviceLineId,
      itemId,
      supplierId: d.supplierId?.trim() || null,
      batchNo: d.batchNo?.trim() || null,
      expiryDate: d.expiryDate?.trim() || null,
      packQuantity,
      packSize,
      packUnitId,
      baseUnitId: d.baseUnitId?.trim() || null,
      totalCost,
      currency: d.currency?.trim() || "AED",
      toLocationId: d.toLocationId?.trim() || null,
      paymentMode: d.paymentMode ?? "payable",
      referenceNo: d.referenceNo?.trim() || null,
    });
    await audit(c, tenantId, {
      table: "item_purchases", rowId: r.purchaseId, action: "insert",
      newValue: { item_id: itemId, total_cost: totalCost, unit_cost: r.unitCost, batch_id: r.batchId, journal_entry_id: r.journalEntryId },
      note: "chemical purchase logged in admin console",
    });
    return r;
  });

  // Ledger already posted synchronously inside recordPurchase; drain marks the
  // purchase.recorded event processed. drainOnce is idempotent (K1 proof).
  try {
    await drainOnce(pool, consumers);
  } catch (e) {
    console.error("[purchases] outbox drain after purchase failed (non-fatal):", (e as Error).message);
  }

  return { purchaseId: res.purchaseId, batchId: res.batchId, unitCost: res.unitCost, totalBaseQuantity: res.totalBaseQuantity };
}
