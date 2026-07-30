"use client";
import { useMemo, useState } from "react";

interface ItemOpt { id: string; name: string; base_unit_id: string | null; base_unit_code: string | null; }
interface UnitOpt { id: string; code: string | null; name: string; dimension: string; to_base_factor: string; base_unit_id: string | null; }
interface SupplierOpt { id: string; name: string; }
interface LocationOpt { id: string; name: string; location_type: string; is_assumed: boolean; }

// Purchase logging with a LIVE derived unit-cost preview, so the value can be
// sanity-checked before saving. The server (recordPurchase) recomputes the cost
// authoritatively via fn_to_base_qty — this preview mirrors that formula.
export function PurchaseForm({
  action, items, units, suppliers, locations,
}: {
  action: (fd: FormData) => Promise<void>;
  items: ItemOpt[];
  units: UnitOpt[];
  suppliers: SupplierOpt[];
  locations: LocationOpt[];
}) {
  const [itemId, setItemId] = useState("");
  const [packUnitId, setPackUnitId] = useState("");
  const [packQty, setPackQty] = useState("");
  const [packSize, setPackSize] = useState("");
  const [totalCost, setTotalCost] = useState("");

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const selectedItem = items.find((i) => i.id === itemId);

  const preview = useMemo(() => {
    const u = unitById.get(packUnitId);
    const qty = Number(packQty);
    const size = Number(packSize);
    const cost = Number(totalCost);
    if (!u || !(qty > 0) || !(size > 0) || !Number.isFinite(cost) || cost < 0) return null;
    const factor = Number(u.to_base_factor) || 1;
    const totalBase = qty * size * factor;
    if (!(totalBase > 0)) return null;
    const baseUnit = u.base_unit_id ? unitById.get(u.base_unit_id) : u; // pack unit's own base
    const baseCode = baseUnit?.code ?? "base unit";
    return { unitCost: cost / totalBase, totalBase, baseCode };
  }, [packUnitId, packQty, packSize, totalCost, unitById]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="base_unit_id" value={selectedItem?.base_unit_id ?? ""} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-neutral-600">Chemical *</span>
          <select name="item_id" required value={itemId} onChange={(e) => setItemId(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
            <option value="">Select…</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Supplier</span>
          <select name="supplier_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Quantity (packs) *</span>
          <input name="pack_quantity" type="number" min="0" step="any" required value={packQty}
                 onChange={(e) => setPackQty(e.target.value)} placeholder="e.g. 1"
                 className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-neutral-600">Unit size *</span>
            <input name="pack_size" type="number" min="0" step="any" required value={packSize}
                   onChange={(e) => setPackSize(e.target.value)} placeholder="e.g. 10"
                   className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-neutral-600">Unit *</span>
            <select name="pack_unit_id" required value={packUnitId} onChange={(e) => setPackUnitId(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
            </select>
          </label>
        </div>
        <label className="text-sm">
          <span className="text-neutral-600">Total cost (AED) *</span>
          <input name="total_cost" type="number" min="0" step="any" required value={totalCost}
                 onChange={(e) => setTotalCost(e.target.value)} placeholder="e.g. 100"
                 className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Batch number</span>
          <input name="batch_no" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Expiry</span>
          <input name="expiry_date" type="date" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Invoice / GRN reference</span>
          <input name="reference_no" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Received into</span>
          <select name="to_location_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.location_type}){l.is_assumed ? " — ASSUMED" : ""}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Payment</span>
          <select name="payment_mode" defaultValue="payable" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
            <option value="payable">On account (payable)</option>
            <option value="cash">Cash</option>
          </select>
        </label>
      </div>

      {/* Live derived unit cost */}
      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm">
        {preview ? (
          <span>
            Derived unit cost:{" "}
            <span className="font-semibold text-neutral-900">
              AED {preview.unitCost.toLocaleString(undefined, { maximumFractionDigits: 6 })} / {preview.baseCode}
            </span>
            <span className="text-neutral-500"> · {preview.totalBase.toLocaleString()} {preview.baseCode} received</span>
          </span>
        ) : (
          <span className="text-neutral-500">Enter quantity, unit size, unit and total cost to preview the unit cost.</span>
        )}
      </div>

      <button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">
        Log purchase
      </button>
    </form>
  );
}
