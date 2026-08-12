import { getTenantId } from "@/lib/tenant";
import { listServiceLines } from "@/lib/domain/reference";
import { listFieldDefs, ENTITY_TYPES, DATA_TYPES, type FieldDef } from "@/lib/domain/fielddefs";
import { AssumedBadge } from "@/components/AssumedBadge";
import { PageHeader } from "@/components/ui";
import { createFieldDefAction, updateFieldDefAction, confirmFieldDefAction, deleteFieldDefAction } from "./actions";

// Form questions admin (Release 1 item 8). Configures field_definitions — the
// per-entity custom question sets the DB validator has enforced since mig 001 but
// which had no admin screen. Questions declared here become admin-configurable
// reference data (Art. XVIII: data, not code); the spec's per-category survey and
// registration question sets (Parts B/L) are entered here, seeded ASSUMED.
export const dynamic = "force-dynamic";

const ENTITY_LABEL: Record<string, string> = {
  customer: "Customer registration", customer_branch: "Site / branch", contract: "Contract",
  job: "Job", service_report: "Service report", item: "Item / chemical", survey: "Survey",
};

export default async function FieldDefinitionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const [defs, serviceLines] = await Promise.all([listFieldDefs(tenantId), listServiceLines(tenantId)]);

  const byEntity = new Map<string, FieldDef[]>();
  for (const d of defs) {
    byEntity.set(d.entity_type, [...(byEntity.get(d.entity_type) ?? []), d]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Form questions"
        description="Custom fields per entity — what registration, survey and job forms ask. The database enforces these definitions (unknown or missing-required values are rejected), so questions configured here are live immediately: data, not code."
      />
      {sp.error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{sp.error}</div>}

      {/* New question */}
      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={defs.length === 0}>
        <summary className="cursor-pointer font-medium">Add a question / field</summary>
        <form action={createFieldDefAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm"><span className="text-neutral-600">Applies to</span>
            <select name="entity_type" required className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              {ENTITY_TYPES.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e] ?? e}</option>)}
            </select></label>
          <label className="text-sm"><span className="text-neutral-600">Division (blank = all)</span>
            <select name="service_line_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">All divisions</option>
              {serviceLines.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
          <label className="text-sm"><span className="text-neutral-600">Field key (snake_case)</span>
            <input name="field_key" required pattern="[a-z][a-z0-9_]{1,62}" placeholder="kitchen_area_sqm"
                   className="mt-1 w-full rounded border border-neutral-300 px-2 py-2 font-mono" /></label>
          <label className="text-sm"><span className="text-neutral-600">Label (what the user sees)</span>
            <input name="label" required placeholder="Kitchen area (m²)" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <label className="text-sm"><span className="text-neutral-600">Type</span>
            <select name="data_type" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
          <label className="text-sm sm:col-span-2"><span className="text-neutral-600">Options (enum only, comma-separated)</span>
            <input name="enum_values" placeholder="low, medium, high" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_required" className="h-4 w-4" /> Required</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_assumed" className="h-4 w-4" /> ASSUMED</label>
          </div>
          <div className="flex items-end">
            <button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Add question</button>
          </div>
        </form>
        <p className="mt-3 text-xs text-neutral-500">
          The field key is permanent once created (stored values hang off it). Mark research-proposed questions ASSUMED until confirmed.
        </p>
      </details>

      {/* Existing, grouped by entity */}
      {ENTITY_TYPES.filter((e) => byEntity.has(e)).map((e) => (
        <section key={e} className="rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-3 font-medium">{ENTITY_LABEL[e] ?? e} <span className="text-neutral-400">({byEntity.get(e)!.length})</span></div>
          <div className="divide-y divide-neutral-100">
            {byEntity.get(e)!.map((d) => (
              <details key={d.id} className="px-4 py-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{d.label}</span>
                  <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{d.field_key}</code>
                  <span className="text-xs text-neutral-500">{d.data_type}{d.is_required && " · required"}</span>
                  {d.service_line_name && <span className="rounded-full bg-navy/10 px-2 py-0.5 text-xs text-navy">{d.service_line_name}</span>}
                  {d.is_assumed && <AssumedBadge />}
                </summary>
                <div className="mt-3 space-y-3">
                  <form action={updateFieldDefAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="entity_type" value={d.entity_type} />
                    <input type="hidden" name="field_key" value={d.field_key} />
                    <label className="text-sm"><span className="text-neutral-600">Label</span>
                      <input name="label" defaultValue={d.label} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
                    <label className="text-sm"><span className="text-neutral-600">Type</span>
                      <select name="data_type" defaultValue={d.data_type} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
                        {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select></label>
                    <label className="text-sm"><span className="text-neutral-600">Division</span>
                      <select name="service_line_id" defaultValue={d.service_line_id ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
                        <option value="">All divisions</option>
                        {serviceLines.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select></label>
                    <label className="text-sm"><span className="text-neutral-600">Options (enum)</span>
                      <input name="enum_values" defaultValue={(d.enum_values ?? []).join(", ")} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_required" defaultChecked={d.is_required} className="h-4 w-4" /> Required</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_assumed" defaultChecked={d.is_assumed} className="h-4 w-4" /> ASSUMED</label>
                    </div>
                    <div className="flex items-end gap-2">
                      <button className="rounded bg-neutral-800 px-3 py-2 text-sm text-white hover:bg-neutral-700">Save</button>
                    </div>
                  </form>
                  <div className="flex gap-2">
                    {d.is_assumed && (
                      <form action={confirmFieldDefAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <button className="rounded border border-emerald-500 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50">I confirm this question</button>
                      </form>
                    )}
                    <form action={deleteFieldDefAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-red-300 hover:text-red-600">Delete</button>
                    </form>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
      {defs.length === 0 && (
        <p className="text-sm text-neutral-500">
          No custom questions yet. This is where the per-category registration and survey question sets live — add them here and the forms enforce them immediately.
        </p>
      )}
    </div>
  );
}
