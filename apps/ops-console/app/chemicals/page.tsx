import { getTenantId } from "@/lib/tenant";
import { getServiceLineId, listServiceTypes, type Ref } from "@/lib/domain/reference";
import { listUnits, type Unit } from "@/lib/domain/units";
import { listItems, type Item } from "@/lib/domain/items";
import { AssumedBadge } from "@/components/AssumedBadge";
import Link from "next/link";
import { createItemAction, updateItemAction, confirmItemAction, archiveItemAction, restoreItemAction } from "./actions";

export const dynamic = "force-dynamic";

// Shared field set for both create and edit (server component helper).
function ChemicalFields({ units, serviceTypes, item }: { units: Unit[]; serviceTypes: Ref[]; item?: Item }) {
  const selected = new Set(item?.intended_service_type_ids ?? []);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="text-sm">
        <span className="text-neutral-600">Name *</span>
        <input name="name" required defaultValue={item?.name ?? ""} placeholder="e.g. Fipronil 2.5% SC"
               className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
      </label>
      <label className="text-sm">
        <span className="text-neutral-600">Active ingredient</span>
        <input name="active_ingredient" defaultValue={item?.active_ingredient ?? ""} placeholder="e.g. Fipronil"
               className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
      </label>
      <label className="text-sm">
        <span className="text-neutral-600">Unit of measure (base)</span>
        <select name="base_unit_id" defaultValue={item?.base_unit_id ?? ""}
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
          <option value="">—</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
        </select>
      </label>
      <label className="text-sm">
        <span className="text-neutral-600">Reorder level <span className="text-neutral-400">(in base unit)</span></span>
        <input name="reorder_level" type="number" min="0" step="any" defaultValue={item?.reorder_level ?? ""}
               className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
      </label>
      <label className="text-sm">
        <span className="text-neutral-600">Shelf life <span className="text-neutral-400">(days)</span></span>
        <input name="shelf_life_days" type="number" min="1" step="1" defaultValue={item?.shelf_life_days ?? ""}
               className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
      </label>
      <label className="text-sm">
        <span className="text-neutral-600">Code <span className="text-neutral-400">(optional)</span></span>
        <input name="code" defaultValue={item?.code ?? ""}
               className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
      </label>
      <fieldset className="text-sm sm:col-span-2">
        <span className="text-neutral-600">Intended service types</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {serviceTypes.length === 0 && <span className="text-neutral-400">No service types defined</span>}
          {serviceTypes.map((s) => (
            <label key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-3 py-1.5">
              <input type="checkbox" name="service_type_ids" value={s.id} defaultChecked={selected.has(s.id)} />
              <span>{s.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="is_recurring_stock" defaultChecked={item?.is_recurring_stock ?? false} />
        <span className="text-neutral-700">Regularly-stocked (reordered) chemical</span>
      </label>
    </div>
  );
}

export default async function ChemicalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const tenantId = await getTenantId();
  await getServiceLineId(tenantId);
  const [items, units, serviceTypes] = await Promise.all([
    listItems(tenantId, includeArchived),
    listUnits(tenantId),
    listServiceTypes(tenantId),
  ]);
  const stName = new Map(serviceTypes.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Chemical master</h1>
          <p className="mt-1 text-sm text-neutral-600">{items.length} chemical(s)</p>
        </div>
        <Link href={includeArchived ? "/chemicals" : "/chemicals?archived=1"}
              className={`rounded border px-3 py-1.5 text-sm ${includeArchived ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 hover:bg-neutral-50"}`}>
          {includeArchived ? "✓ Including archived" : "Include archived"}
        </Link>
      </div>

      {/* Create */}
      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={items.length === 0}>
        <summary className="cursor-pointer font-medium">New chemical</summary>
        <form action={createItemAction} className="mt-4 space-y-4">
          <ChemicalFields units={units} serviceTypes={serviceTypes} />
          <button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">
            Create chemical
          </button>
        </form>
      </details>

      {/* List */}
      <div className="grid grid-cols-1 gap-3">
        {items.length === 0 && (
          <p className="rounded-lg border border-neutral-200 bg-white px-4 py-6 text-center text-neutral-500">
            No chemicals yet — create one above.
          </p>
        )}
        {items.map((it) => (
          <div key={it.id} className={`rounded-lg border border-neutral-200 bg-white p-4 ${it.archived_at ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{it.name}</span>
                  {it.is_assumed && <AssumedBadge note={it.assumed_note} />}
                  {it.archived_at && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">archived</span>}
                </div>
                <div className="mt-1 text-sm text-neutral-600">
                  {it.active_ingredient ? <span>{it.active_ingredient}</span> : <span className="text-neutral-400">no active ingredient</span>}
                  {" · "}
                  <span>UoM: {it.base_unit_code ?? <span className="text-amber-600">unset</span>}</span>
                  {it.reorder_level != null && <span> · reorder ≤ {it.reorder_level}</span>}
                  {it.shelf_life_days != null && <span> · shelf {it.shelf_life_days}d</span>}
                  {it.is_recurring_stock && <span> · recurring</span>}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {it.intended_service_type_ids.length > 0
                    ? it.intended_service_type_ids.map((id) => stName.get(id) ?? "?").join(", ")
                    : "no service types"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {it.is_assumed && (
                  <form action={confirmItemAction}>
                    <input type="hidden" name="id" value={it.id} />
                    <button className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
                      I confirm this value
                    </button>
                  </form>
                )}
                {it.archived_at ? (
                  <form action={restoreItemAction}><input type="hidden" name="id" value={it.id} />
                    <button className="text-xs text-brand hover:underline">restore</button></form>
                ) : (
                  <form action={archiveItemAction}><input type="hidden" name="id" value={it.id} />
                    <button className="text-xs text-neutral-500 hover:text-red-600">archive</button></form>
                )}
              </div>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-brand">Edit</summary>
              <form action={updateItemAction} className="mt-3 space-y-4">
                <input type="hidden" name="id" value={it.id} />
                <ChemicalFields units={units} serviceTypes={serviceTypes} item={it} />
                <button className="w-full rounded bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 sm:w-auto">
                  Save changes
                </button>
              </form>
            </details>
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-500">Every create, edit, and confirm writes to the audit log.</p>
    </div>
  );
}
