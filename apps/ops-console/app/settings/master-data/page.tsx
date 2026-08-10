import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { AssumedBadge } from "@/components/AssumedBadge";
import { listCatalog, CATALOGS, type CatalogKey, type CatalogItem } from "@/lib/domain/refdata";
import { listFrequenciesAdmin, PERIOD_UNITS, type Frequency } from "@/lib/domain/frequencies";
import { listSuppliers, type Supplier } from "@/lib/domain/suppliers";
import { listPricingModels, type PricingModel } from "@/lib/domain/pricing";
import {
  createCatalogAction, updateCatalogAction, archiveCatalogAction, restoreCatalogAction,
  createFrequencyAction, updateFrequencyAction, archiveFrequencyAction, restoreFrequencyAction,
  createSupplierAction, updateSupplierAction, archiveSupplierAction, restoreSupplierAction,
  archivePricingAction, restorePricingAction,
} from "./actions";

export const dynamic = "force-dynamic";

const input = "mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm";
const primaryBtn = "rounded bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark";
const saveBtn = "rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700";

function ActiveBadge({ item }: { item: { is_active: boolean; is_assumed?: boolean; assumed_note?: string | null } }) {
  if (!item.is_active) return <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">archived</span>;
  if (item.is_assumed) return <AssumedBadge note={item.assumed_note} />;
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-300">✓ active</span>;
}

function ArchiveCell({ active, archive, restore, hidden }: {
  active: boolean; archive: (fd: FormData) => Promise<void>; restore: (fd: FormData) => Promise<void>; hidden: React.ReactNode;
}) {
  return active ? (
    <form action={archive}>{hidden}<button className="text-xs text-neutral-500 hover:text-red-600">archive</button></form>
  ) : (
    <form action={restore}>{hidden}<button className="text-xs text-brand hover:underline">restore</button></form>
  );
}

function CatalogSection({ ckey, items }: { ckey: CatalogKey; items: CatalogItem[] }) {
  const c = CATALOGS[ckey];
  const hidden = <input type="hidden" name="catalog" value={ckey} />;
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 font-medium">{c.label} <span className="text-neutral-400">({items.filter((i) => i.is_active).length})</span></h2>
      <div className="mb-3 overflow-hidden rounded border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th>{c.hasDescription && <th className="px-3 py-2">Description</th>}<th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.length === 0 && <tr><td colSpan={c.hasDescription ? 5 : 4} className="px-3 py-4 text-center text-neutral-500">None yet.</td></tr>}
            {items.map((i) => (
              <tr key={i.id} className={`align-top ${i.is_active ? "" : "opacity-60"}`}>
                <td className="px-3 py-2 font-mono text-xs text-neutral-500">{i.code ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{i.name}</div>
                  {i.is_active && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-brand">Edit</summary>
                      <form action={updateCatalogAction} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {hidden}<input type="hidden" name="id" value={i.id} />
                        <input name="code" defaultValue={i.code ?? ""} placeholder="Code" className={input} />
                        <input name="name" defaultValue={i.name} placeholder="Name" className={input} />
                        {c.hasDescription && <input name="description" defaultValue={i.description ?? ""} placeholder="Description" className={input} />}
                        <div className="sm:col-span-3"><button className={saveBtn}>Save changes</button></div>
                      </form>
                    </details>
                  )}
                </td>
                {c.hasDescription && <td className="px-3 py-2 text-neutral-600">{i.description ?? "—"}</td>}
                <td className="px-3 py-2"><ActiveBadge item={i} /></td>
                <td className="px-3 py-2 text-right">
                  <ArchiveCell active={i.is_active} archive={archiveCatalogAction} restore={restoreCatalogAction}
                    hidden={<>{hidden}<input type="hidden" name="id" value={i.id} /></>} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="rounded border border-neutral-200 p-4" open={items.length === 0}>
        <summary className="cursor-pointer text-sm font-medium">Add {c.singular}</summary>
        <form action={createCatalogAction} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {hidden}
          <input name="code" placeholder="Code" required className={input} />
          <input name="name" placeholder="Name" required className={input} />
          {c.hasDescription && <input name="description" placeholder="Description (optional)" className={input} />}
          <div className="sm:col-span-3"><button className={primaryBtn}>Add {c.singular}</button></div>
        </form>
      </details>
    </section>
  );
}

function FrequencySection({ items }: { items: Frequency[] }) {
  const unitField = (name: string, val?: string) => (
    <select name={name} defaultValue={val ?? "month"} className={input}>
      {PERIOD_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
    </select>
  );
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-medium">Frequencies <span className="text-neutral-400">({items.filter((i) => i.is_active).length})</span></h2>
      <p className="mb-3 text-xs text-neutral-500">The period spec is machine-usable — the scheduler computes visit dates from it deterministically. Editing it changes future scheduling only.</p>
      <div className="mb-3 overflow-hidden rounded border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Spec</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-neutral-500">None yet.</td></tr>}
            {items.map((f) => (
              <tr key={f.id} className={`align-top ${f.is_active ? "" : "opacity-60"}`}>
                <td className="px-3 py-2 font-mono text-xs text-neutral-500">{f.code ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{f.name}</div>
                  {f.is_active && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-brand">Edit</summary>
                      <form action={updateFrequencyAction} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <input type="hidden" name="id" value={f.id} />
                        <input name="code" defaultValue={f.code ?? ""} placeholder="Code" className={input} />
                        <input name="name" defaultValue={f.name} placeholder="Name" className={input} />
                        {unitField("period_unit", f.period_unit)}
                        <input name="period_count" type="number" min="1" defaultValue={f.period_count} placeholder="Every N" className={input} />
                        <input name="visits_per_period" type="number" min="1" defaultValue={f.visits_per_period} placeholder="Visits" className={input} />
                        <div className="sm:col-span-5"><button className={saveBtn}>Save changes</button></div>
                      </form>
                    </details>
                  )}
                </td>
                <td className="px-3 py-2 text-neutral-600">{f.visits_per_period}× per {f.period_count} {f.period_unit}{f.period_count > 1 ? "s" : ""}</td>
                <td className="px-3 py-2"><ActiveBadge item={f} /></td>
                <td className="px-3 py-2 text-right">
                  <ArchiveCell active={f.is_active} archive={archiveFrequencyAction} restore={restoreFrequencyAction}
                    hidden={<input type="hidden" name="id" value={f.id} />} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="rounded border border-neutral-200 p-4" open={items.length === 0}>
        <summary className="cursor-pointer text-sm font-medium">Add frequency</summary>
        <form action={createFrequencyAction} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input name="code" placeholder="Code" required className={input} />
          <input name="name" placeholder="Name" required className={input} />
          {unitField("period_unit")}
          <input name="period_count" type="number" min="1" defaultValue="1" placeholder="Every N" className={input} />
          <input name="visits_per_period" type="number" min="1" defaultValue="1" placeholder="Visits" className={input} />
          <div className="sm:col-span-5"><button className={primaryBtn}>Add frequency</button></div>
        </form>
      </details>
    </section>
  );
}

function SupplierSection({ items }: { items: Supplier[] }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 font-medium">Suppliers <span className="text-neutral-400">({items.filter((i) => i.is_active).length})</span></h2>
      <div className="mb-3 overflow-hidden rounded border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">TRN</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-neutral-500">None yet.</td></tr>}
            {items.map((s) => (
              <tr key={s.id} className={`align-top ${s.is_active ? "" : "opacity-60"}`}>
                <td className="px-3 py-2 font-mono text-xs text-neutral-500">{s.code ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{s.name}</div>
                  {s.is_active && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-brand">Edit</summary>
                      <form action={updateSupplierAction} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input type="hidden" name="id" value={s.id} />
                        <input name="code" defaultValue={s.code ?? ""} placeholder="Code" className={input} />
                        <input name="name" defaultValue={s.name} placeholder="Name" className={input} />
                        <input name="trn" defaultValue={s.trn ?? ""} placeholder="TRN" className={input} />
                        <div className="sm:col-span-3"><button className={saveBtn}>Save changes</button></div>
                      </form>
                    </details>
                  )}
                </td>
                <td className="px-3 py-2 text-neutral-600">{s.trn ?? "—"}</td>
                <td className="px-3 py-2"><ActiveBadge item={s} /></td>
                <td className="px-3 py-2 text-right">
                  <ArchiveCell active={s.is_active} archive={archiveSupplierAction} restore={restoreSupplierAction}
                    hidden={<input type="hidden" name="id" value={s.id} />} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="rounded border border-neutral-200 p-4" open={items.length === 0}>
        <summary className="cursor-pointer text-sm font-medium">Add supplier</summary>
        <form action={createSupplierAction} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input name="code" placeholder="Code" className={input} />
          <input name="name" placeholder="Name" required className={input} />
          <input name="trn" placeholder="TRN" className={input} />
          <div className="sm:col-span-3"><button className={primaryBtn}>Add supplier</button></div>
        </form>
      </details>
    </section>
  );
}

function PricingSection({ items }: { items: PricingModel[] }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Pricing models <span className="text-neutral-400">({items.filter((i) => i.is_active).length})</span></h2>
        <Link href="/pricing" className="text-sm text-brand underline">Add / edit on Pricing →</Link>
      </div>
      <div className="overflow-hidden rounded border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-neutral-500">None yet.</td></tr>}
            {items.map((m) => (
              <tr key={m.id} className={m.is_active ? "" : "opacity-60"}>
                <td className="px-3 py-2 font-mono text-xs text-neutral-500">{m.code ?? "—"}</td>
                <td className="px-3 py-2 font-medium">{m.name}</td>
                <td className="px-3 py-2 text-neutral-600">{m.model_type}</td>
                <td className="px-3 py-2"><ActiveBadge item={{ is_active: m.is_active ?? true, is_assumed: m.is_assumed, assumed_note: m.assumed_note }} /></td>
                <td className="px-3 py-2 text-right">
                  <ArchiveCell active={m.is_active ?? true} archive={archivePricingAction} restore={restorePricingAction}
                    hidden={<input type="hidden" name="id" value={m.id} />} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function MasterDataPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const inc = sp.archived === "1";
  const tenantId = await getTenantId();
  const [serviceTypes, jobTypes, facilityTypes, jobSources, frequencies, suppliers, pricing] = await Promise.all([
    listCatalog(tenantId, "service_types", inc),
    listCatalog(tenantId, "job_types", inc),
    listCatalog(tenantId, "facility_types", inc),
    listCatalog(tenantId, "job_sources", inc),
    listFrequenciesAdmin(tenantId, inc),
    listSuppliers(tenantId, inc),
    listPricingModels(tenantId, inc),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Master data</h1>
          <p className="mt-1 text-sm text-neutral-600">Reference catalogues used across the platform. Archiving deactivates an entry (it drops out of new-work pickers); history is preserved and nothing is deleted. Every change is audit-logged.</p>
        </div>
        <Link href={inc ? "/settings/master-data" : "/settings/master-data?archived=1"}
              className={`shrink-0 rounded border px-3 py-1.5 text-sm ${inc ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 hover:bg-neutral-50"}`}>
          {inc ? "✓ Including archived" : "Include archived"}
        </Link>
      </div>

      <CatalogSection ckey="service_types" items={serviceTypes} />
      <CatalogSection ckey="job_types" items={jobTypes} />
      <FrequencySection items={frequencies} />
      <CatalogSection ckey="facility_types" items={facilityTypes} />
      <CatalogSection ckey="job_sources" items={jobSources} />
      <SupplierSection items={suppliers} />
      <PricingSection items={pricing} />
    </div>
  );
}
