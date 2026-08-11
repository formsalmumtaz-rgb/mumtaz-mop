import { getTenantId } from "@/lib/tenant";
import { requireView } from "@/lib/auth";
import { listPricingModels, listServiceModelMap } from "@/lib/domain/pricing";
import { AssumedBadge } from "@/components/AssumedBadge";
import { PricingModelForm } from "./PricingModelForm";
import { createModelAction, updateModelAction, setServiceModelsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const tenantId = await getTenantId();
  await requireView("settings.manage");
  const [models, svcMap] = await Promise.all([listPricingModels(tenantId), listServiceModelMap(tenantId)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pricing models</h1>
        <p className="mt-1 text-sm text-neutral-600">Reusable pricing models — each service selects which it supports. Prices compute deterministically (fn_price); formulas are structured (base + Σ measure×rate), never free-text.</p>
      </div>

      {/* Create */}
      <details className="rounded-lg border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer font-medium">New pricing model</summary>
        <PricingModelForm action={createModelAction} submitLabel="Create model" />
      </details>

      {/* Catalogue */}
      <div className="grid grid-cols-1 gap-3">
        {models.map((m) => (
          <div key={m.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="font-medium">{m.name}</span>
              <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-600">{m.model_type}</span>
              {m.is_assumed && <AssumedBadge note={m.assumed_note} />}
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-brand">Edit / preview</summary>
              <PricingModelForm
                action={updateModelAction}
                submitLabel="Save changes"
                initial={{ id: m.id, name: m.name, model_type: m.model_type, formula_spec: m.formula_spec }}
              />
            </details>
          </div>
        ))}
      </div>

      {/* Service → supported models */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-medium">Supported models per service</h2>
        <p className="mt-1 text-sm text-neutral-600">Tick the models each service may use; pick one default.</p>
        <div className="mt-3 space-y-4">
          {svcMap.length === 0 && <p className="text-sm text-neutral-500">No service types defined.</p>}
          {svcMap.map((s) => (
            <form key={s.service_type_id} action={setServiceModelsAction} className="rounded border border-neutral-200 p-3">
              <input type="hidden" name="service_type_id" value={s.service_type_id} />
              <div className="mb-2 font-medium text-neutral-800">{s.service_name}</div>
              <div className="flex flex-wrap gap-2">
                {models.map((m) => (
                  <label key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-3 py-1 text-sm">
                    <input type="checkbox" name="model_id" value={m.id} defaultChecked={s.model_ids.includes(m.id)} />
                    <span>{m.name}</span>
                  </label>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-neutral-600">Default</span>
                <select name="default_id" defaultValue={s.default_id ?? ""} className="rounded border border-neutral-300 px-2 py-1">
                  <option value="">—</option>
                  {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button className="ml-auto rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700">Save</button>
              </div>
            </form>
          ))}
        </div>
      </div>

      <p className="text-xs text-neutral-500">Every change is audit-logged. Measures (area, rooms, ducts…) come from the survey/Estimation engine; this engine computes the price given a model and its measures.</p>
    </div>
  );
}
