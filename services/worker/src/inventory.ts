// Inventory valuation & costing (Tier 1 · Item 1). Deterministic — pure SQL and
// arithmetic, no model call (Constitution Art. I). Perpetual inventory:
//   receipt      Dr Inventory asset   Cr Payable|Cash        (recordPurchase)
//   consumption  Dr Chemical expense  Cr Inventory asset     (postConsumptionValuation)
// Every consumption posts ONE balanced entry per event — never one per unit.
// Accounts and the batch-allocation strategy are settings-driven (mig 016); when
// they are absent the physical stock_movement still records — valuation posts
// only once a cost basis and accounts exist.
import type { PoolClient } from "pg";
import { emitEvent } from "./outbox";

export interface InventoryAccounts {
  asset: string;
  expense: string;
  payable: string | null;
  rounding: string | null;
}

// Resolve the GL accounts the inventory settings map to (tenant-scoped codes ->
// account ids). Returns null when the essential asset/expense pair is unset, so
// callers degrade gracefully rather than posting a half entry.
export async function resolveInventoryAccounts(
  c: PoolClient,
  tenantId: string,
): Promise<InventoryAccounts | null> {
  const { rows } = await c.query(
    `select s.key, a.id
       from settings s
       join accounts a on a.tenant_id = s.tenant_id and a.code = (s.value #>> '{}')
      where s.tenant_id = $1
        and s.key in ('inventory.account_code.asset','inventory.account_code.expense',
                      'inventory.account_code.payable','inventory.account_code.rounding')`,
    [tenantId],
  );
  const m: Record<string, string> = {};
  for (const r of rows) m[String(r.key).split(".").pop() as string] = r.id;
  if (!m.asset || !m.expense) return null;
  return { asset: m.asset, expense: m.expense, payable: m.payable ?? null, rounding: m.rounding ?? null };
}

// Resolve a settings-driven cash/bank account code (only needed for cash receipts).
async function resolveCashAccount(c: PoolClient, tenantId: string): Promise<string | null> {
  const { rows } = await c.query(
    `select a.id from settings s
       join accounts a on a.tenant_id = s.tenant_id and a.code = (s.value #>> '{}')
      where s.tenant_id = $1 and s.key = 'inventory.account_code.cash' limit 1`,
    [tenantId],
  );
  return rows[0]?.id ?? null;
}

// Batch allocation strategy: service-line setting wins over tenant-level; default
// 'fefo_then_fifo' (nearest expiry, ties/nulls fall back to oldest received).
export async function resolveStrategy(
  c: PoolClient,
  tenantId: string,
  serviceLineId: string | null,
): Promise<string> {
  const { rows } = await c.query(
    `select value #>> '{}' as v from settings
      where tenant_id = $1 and key = 'inventory.batch_allocation_strategy'
        and (service_line_id = $2 or service_line_id is null)
      order by service_line_id nulls last limit 1`,
    [tenantId, serviceLineId],
  );
  return rows[0]?.v ?? "fefo_then_fifo";
}

// Value a single consumption movement at its batch's frozen unit cost and post
// ONE balanced entry (Dr expense / Cr inventory), both lines traceable to the
// movement. Idempotent: skips if the movement has no costed batch, if accounts
// are unset, or if a valuation entry for this movement already exists.
export async function postConsumptionValuation(
  c: PoolClient,
  args: { tenantId: string; serviceLineId: string | null; movementId: string },
): Promise<{ entryId: string; amount: number } | null> {
  const { tenantId, serviceLineId, movementId } = args;
  const { rows } = await c.query(
    `select round(fn_to_base_qty(m.unit_id, m.quantity) * b.unit_cost, 2) as amount,
            coalesce(b.cost_currency, 'AED') as currency
       from stock_movements m
       join item_batches b on b.id = m.batch_id
      where m.id = $1 and b.unit_cost is not null`,
    [movementId],
  );
  if (!rows[0]) return null; // no batch / no cost basis
  const amount = Number(rows[0].amount);
  if (!(amount > 0)) return null;

  const accounts = await resolveInventoryAccounts(c, tenantId);
  if (!accounts) return null; // ledger accounts not configured — physical movement stands

  const dup = await c.query(
    `select 1 from journal_entries where tenant_id = $1 and source_type = 'stock_valuation' and source_id = $2 limit 1`,
    [tenantId, movementId],
  );
  if (dup.rowCount) return null; // already valued (belt-and-suspenders vs the per-event claim)

  const je = await c.query(
    `insert into journal_entries(tenant_id, service_line_id, memo, source_type, source_id)
     values ($1,$2,'Chemical consumption (batch valuation)','stock_valuation',$3) returning id`,
    [tenantId, serviceLineId, movementId],
  );
  const entryId = je.rows[0].id as string;
  // Dr expense / Cr inventory asset — one statement, balanced (deferred constraint).
  await c.query(
    `insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, stock_movement_id, memo)
     values ($1,$2,$3,$4,0,$5,$6,'Cost of chemicals consumed'),
            ($1,$2,$7,0,$4,$5,$6,'Inventory relieved at batch cost')`,
    [tenantId, entryId, accounts.expense, amount, rows[0].currency, movementId, accounts.asset],
  );
  return { entryId, amount };
}

export interface RecordPurchaseInput {
  tenantId: string;
  serviceLineId: string | null;
  itemId: string;
  supplierId?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null; // ISO date
  packQuantity: number; // number of packs
  packSize: number; // size of one pack
  packUnitId: string; // unit of pack_size (e.g. 'l')
  baseUnitId?: string | null; // item base unit (e.g. 'ml')
  totalCost: number;
  currency?: string;
  toLocationId?: string | null; // where the stock lands (warehouse/van)
  paymentMode?: "payable" | "cash";
  referenceNo?: string | null; // supplier invoice / GRN ref
  createdBy?: string | null;
}

// Record a goods receipt: create the cost lot (item_batch, frozen unit_cost),
// the physical 'receipt' movement, the perpetual ledger entry (Dr Inventory /
// Cr Payable|Cash), and the append-only item_purchases provenance row linking
// them. Emits purchase.recorded. Deterministic; caller supplies the transaction.
export async function recordPurchase(
  c: PoolClient,
  inp: RecordPurchaseInput,
): Promise<{ purchaseId: string; batchId: string; movementId: string; journalEntryId: string | null; unitCost: number; totalBaseQuantity: number }> {
  const currency = inp.currency ?? "AED";
  const paymentMode = inp.paymentMode ?? "payable";

  const qb = await c.query(`select fn_to_base_qty($1, $2::numeric * $3::numeric) as total_base`, [
    inp.packUnitId,
    inp.packQuantity,
    inp.packSize,
  ]);
  const totalBase = Number(qb.rows[0].total_base);
  if (!(totalBase > 0)) throw new Error("recordPurchase: total base quantity must be > 0");
  const unitCost = Number(inp.totalCost) / totalBase;

  const batch = await c.query(
    `insert into item_batches(tenant_id, item_id, batch_no, expiry_date, supplier_id, unit_cost, cost_currency, received_at)
     values ($1,$2,$3,$4,$5,$6,$7, now()) returning id`,
    [inp.tenantId, inp.itemId, inp.batchNo ?? null, inp.expiryDate ?? null, inp.supplierId ?? null, unitCost, currency],
  );
  const batchId = batch.rows[0].id as string;

  const mv = await c.query(
    `insert into stock_movements(tenant_id, service_line_id, item_id, batch_id, to_location_id, movement_type, quantity, unit_id)
     values ($1,$2,$3,$4,$5,'receipt',$6::numeric*$7::numeric,$8) returning id`,
    [inp.tenantId, inp.serviceLineId, inp.itemId, batchId, inp.toLocationId ?? null, inp.packQuantity, inp.packSize, inp.packUnitId],
  );
  const movementId = mv.rows[0].id as string;

  let journalEntryId: string | null = null;
  const accounts = await resolveInventoryAccounts(c, inp.tenantId);
  if (accounts) {
    let credit = accounts.payable;
    if (paymentMode === "cash") {
      credit = await resolveCashAccount(c, inp.tenantId);
      if (!credit) throw new Error("recordPurchase: cash receipt needs settings 'inventory.account_code.cash' + a cash account");
    }
    if (!credit) throw new Error("recordPurchase: no payable account configured (settings 'inventory.account_code.payable')");
    const je = await c.query(
      `insert into journal_entries(tenant_id, service_line_id, memo, source_type, source_id)
       values ($1,$2,'Chemical purchase (goods receipt)','purchase',$3) returning id`,
      [inp.tenantId, inp.serviceLineId, movementId],
    );
    journalEntryId = je.rows[0].id as string;
    await c.query(
      `insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, stock_movement_id, memo)
       values ($1,$2,$3,$4,0,$5,$6,'Inventory received at cost'),
              ($1,$2,$7,0,$4,$5,$6,'Supplier payable / cash')`,
      [inp.tenantId, journalEntryId, accounts.asset, Number(inp.totalCost), currency, movementId, credit],
    );
  }

  const pur = await c.query(
    `insert into item_purchases
       (tenant_id, service_line_id, item_id, batch_id, supplier_id, purchase_date, pack_quantity, pack_size,
        pack_unit_id, base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no,
        journal_entry_id, stock_movement_id, created_by)
     values ($1,$2,$3,$4,$5, current_date, $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
    [
      inp.tenantId, inp.serviceLineId, inp.itemId, batchId, inp.supplierId ?? null, inp.packQuantity, inp.packSize,
      inp.packUnitId, inp.baseUnitId ?? null, totalBase, inp.totalCost, currency, paymentMode, inp.referenceNo ?? null,
      journalEntryId, movementId, inp.createdBy ?? null,
    ],
  );
  const purchaseId = pur.rows[0].id as string;

  await emitEvent(c, {
    tenant_id: inp.tenantId,
    event_type: "purchase.recorded",
    aggregate_type: "item_purchase",
    entity_id: purchaseId,
    payload: { purchase_id: purchaseId, item_id: inp.itemId, total_cost: Number(inp.totalCost), currency },
  });

  return { purchaseId, batchId, movementId, journalEntryId, unitCost, totalBaseQuantity: totalBase };
}
