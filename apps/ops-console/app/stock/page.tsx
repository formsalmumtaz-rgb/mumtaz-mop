import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listOnHand, listLocations, listTransferableItems } from "@/lib/domain/stock";
import { PageHeader } from "@/components/ui";
import { transferStockAction } from "./actions";

// Stock on hand + warehouse→van issue (Release 1 item 5, spec Part E). The on-hand
// view and the 'transfer' movement type existed since mig 007/016 but were never
// surfaced. Consumption on job completion deducts from the van (FEFO), so issuing
// to the van is what makes field jobs draw from the right inventory.
export const dynamic = "force-dynamic";

const qty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const [onHand, locations, items] = await Promise.all([
    listOnHand(tenantId), listLocations(tenantId), listTransferableItems(tenantId),
  ]);

  // Group on-hand rows by location for display.
  const byLocation = new Map<string, { name: string; type: string; rows: typeof onHand }>();
  for (const r of onHand) {
    const g = byLocation.get(r.location_id) ?? { name: r.location_name, type: r.location_type, rows: [] as typeof onHand };
    g.rows.push(r);
    byLocation.set(r.location_id, g);
  }
  const warehouses = locations.filter((l) => l.location_type === "warehouse");
  const vans = locations.filter((l) => l.location_type === "van");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock"
        description="On-hand by location and batch (movement ledger sums — append-only). Issue stock from the warehouse to a team van; jobs consume from the van, FEFO."
      />

      {sp.issued && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Stock issued ✓</div>
      )}
      {sp.error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{sp.error}</div>
      )}

      {/* Issue stock */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 font-medium">Issue stock</h2>
        <p className="mb-4 text-sm text-neutral-600">
          FEFO — earliest-expiry batches are drawn first; every movement keeps its batch identity. Quantity is in the item&apos;s base unit.
          Refuses (writes nothing) if the source doesn&apos;t hold enough.
        </p>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing in stock yet — log a <Link href="/purchases" className="text-brand underline">goods receipt</Link> first.</p>
        ) : (
          <form action={transferStockAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm"><span className="text-neutral-600">Item</span>
              <select name="item_id" required className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
                <option value="">—</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.base_unit ? ` (${i.base_unit})` : ""}</option>)}
              </select></label>
            <label className="text-sm"><span className="text-neutral-600">From</span>
              <select name="from_location_id" required defaultValue={warehouses[0]?.id ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.location_type})</option>)}
              </select></label>
            <label className="text-sm"><span className="text-neutral-600">To</span>
              <select name="to_location_id" required defaultValue={vans[0]?.id ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.location_type})</option>)}
              </select></label>
            <label className="text-sm"><span className="text-neutral-600">Quantity (base unit)</span>
              <input name="qty_base" type="number" step="any" min="0.01" required className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
            <div className="flex items-end">
              <button className="w-full rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Issue →</button>
            </div>
          </form>
        )}
      </section>

      {/* On hand by location */}
      {byLocation.size === 0 ? (
        <p className="text-sm text-neutral-500">No stock on hand.</p>
      ) : (
        [...byLocation.entries()].map(([locId, g]) => (
          <section key={locId} className="rounded-lg border border-neutral-200 bg-white">
            <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3">
              <h2 className="font-medium">{g.name}</h2>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{g.type}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-neutral-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-4 py-2 font-medium">Batch</th>
                    <th className="px-4 py-2 font-medium">Expiry</th>
                    <th className="px-4 py-2 text-right font-medium">On hand</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {g.rows.map((r) => (
                    <tr key={`${r.item_id}-${r.batch_id}`}>
                      <td className="px-4 py-2">{r.item_name}</td>
                      <td className="px-4 py-2 font-mono text-xs text-neutral-600">{r.batch_no ?? "—"}</td>
                      <td className="px-4 py-2 text-neutral-600">{r.expiry_date ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-medium">{qty(r.qty_base)}{r.base_unit && <span className="ml-1 text-xs text-neutral-500">{r.base_unit}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
