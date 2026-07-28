import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { listUnits } from "@/lib/domain/units";
import { listItems } from "@/lib/domain/items";
import { listSuppliers } from "@/lib/domain/suppliers";
import { listPurchases, listStockLocations } from "@/lib/domain/purchases";
import { AssumedBadge } from "@/components/AssumedBadge";
import { PurchaseForm } from "./PurchaseForm";
import { createSupplierAction, logPurchaseAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const tenantId = await getTenantId();
  await getServiceLineId(tenantId);
  const [items, units, suppliers, locations, purchases] = await Promise.all([
    listItems(tenantId),
    listUnits(tenantId),
    listSuppliers(tenantId),
    listStockLocations(tenantId),
    listPurchases(tenantId),
  ]);

  const noChemicals = items.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Purchases</h1>
        <p className="mt-1 text-sm text-neutral-600">Log a goods receipt — a batch is created and valued at cost.</p>
      </div>

      {noChemicals ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Add a chemical in the <a href="/chemicals" className="underline">Chemical master</a> first, then log purchases here.
        </p>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <PurchaseForm action={logPurchaseAction} items={items} units={units} suppliers={suppliers} locations={locations} />
        </div>
      )}

      {/* Suppliers: inline create + list */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Suppliers <span className="text-sm text-neutral-500">({suppliers.length})</span></h2>
        </div>
        <details className="mt-3" open={suppliers.length === 0}>
          <summary className="cursor-pointer text-sm text-brand">Add a supplier</summary>
          <form action={createSupplierAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="text-neutral-600">Name *</span>
              <input name="name" required className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
            </label>
            <label className="text-sm">
              <span className="text-neutral-600">TRN</span>
              <input name="trn" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
            </label>
            <label className="text-sm">
              <span className="text-neutral-600">Code</span>
              <input name="code" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
            </label>
            <div className="sm:col-span-3">
              <button className="w-full rounded bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 sm:w-auto">
                Add supplier
              </button>
            </div>
          </form>
        </details>
        {suppliers.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {suppliers.map((s) => (
              <li key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm">
                {s.name}{s.trn ? <span className="text-neutral-400">· {s.trn}</span> : null}
                {s.is_assumed && <AssumedBadge note={s.assumed_note} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent purchases */}
      <div>
        <h2 className="mb-2 font-medium">Recent purchases</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-neutral-100 text-left text-neutral-600">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Chemical</th>
                <th className="px-3 py-2 font-medium">Supplier</th>
                <th className="px-3 py-2 font-medium">Batch</th>
                <th className="px-3 py-2 font-medium">Received</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
                <th className="px-3 py-2 font-medium text-right">Unit cost</th>
                <th className="px-3 py-2 font-medium">Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {purchases.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-neutral-500">No purchases logged yet.</td></tr>
              )}
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-neutral-600">{p.purchase_date}</td>
                  <td className="px-3 py-2">{p.item_name}</td>
                  <td className="px-3 py-2 text-neutral-600">{p.supplier_name ?? "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">
                    {p.batch_no ?? "—"}{p.expiry_date ? <span className="text-neutral-400"> · exp {p.expiry_date}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-neutral-600">
                    {p.pack_quantity} × {p.pack_size} {p.pack_unit_code ?? ""}
                  </td>
                  <td className="px-3 py-2 text-right">{p.currency} {Number(p.total_cost).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {p.currency} {Number(p.unit_cost).toLocaleString(undefined, { maximumFractionDigits: 6 })}/{p.base_unit_code ?? ""}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">{p.reference_no ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Each purchase creates a cost lot (batch) and posts a balanced receipt entry (Dr Inventory / Cr Payable). All writes are audit-logged.
      </p>
    </div>
  );
}
