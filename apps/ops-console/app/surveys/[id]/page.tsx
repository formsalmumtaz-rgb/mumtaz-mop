import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { listServiceTypes, getServiceLineId } from "@/lib/domain/reference";
import { listPricingModels } from "@/lib/domain/pricing";
import { getCostRates } from "@/lib/domain/costconfig";
import { getSurvey } from "@/lib/domain/survey";
import { listCategories } from "@/lib/domain/categories";
import { LineForm } from "@/components/LineForm";
import { addSurveyLineAction, addSurveyLineFromCategoryAction, deleteSurveyLineAction, setSurveyStatusAction, createEstimateFromSurveyAction } from "../actions";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function SurveyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  const [data, services, models, rates, categories] = await Promise.all([
    getSurvey(tenantId, id),
    listServiceTypes(tenantId),
    listPricingModels(tenantId),
    getCostRates(tenantId),
    listCategories(tenantId, sl),
  ]);
  if (!data) notFound();
  const { header, lines } = data;
  const isDraft = header.status === "draft";
  const margin = header.revenue > 0 ? ((header.gross_profit / header.revenue) * 100).toFixed(1) + "%" : "—";
  const rateProps = {
    labour: Number(rates.labour_rate ?? 0), vehicle: Number(rates.vehicle_rate ?? 0),
    overheadOn: rates.overhead_enabled, overhead: Number(rates.overhead_rate ?? 0),
  };
  const nextStatuses: Record<string, { s: string; label: string }[]> = {
    draft: [{ s: "completed", label: "Mark completed" }, { s: "cancelled", label: "Cancel" }],
    completed: [{ s: "draft", label: "Reopen" }], cancelled: [{ s: "draft", label: "Reopen" }],
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/surveys" className="text-sm text-brand underline">← Surveys</Link>
          <h1 className="mt-1 text-2xl font-semibold">{header.customer ?? "(no customer)"}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Status <span className="font-medium">{header.status}</span>
            {header.survey_date && <> · {header.survey_date}</>}
            {header.surveyor && <> · by {header.surveyor}</>}
            {header.property_type && <> · {header.property_type}</>}
          </p>
        </div>
        <div className="flex gap-2">
          {!header.estimate_id && lines.length > 0 && (
            <form action={createEstimateFromSurveyAction}>
              <input type="hidden" name="survey_id" value={header.id} />
              <button className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Create estimate →</button>
            </form>
          )}
          {header.estimate_id && (
            <Link href={`/estimates/${header.estimate_id}`} className="rounded border border-emerald-500 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50">Estimate created ✓</Link>
          )}
          {(nextStatuses[header.status] ?? []).map((a) => (
            <form key={a.s} action={setSurveyStatusAction}>
              <input type="hidden" name="survey_id" value={header.id} /><input type="hidden" name="status" value={a.s} />
              <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">{a.label}</button>
            </form>
          ))}
        </div>
      </div>

      {/* Profit preview */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Revenue", aed(header.revenue)], ["Est. cost", aed(header.est_cost)], ["Gross profit", aed(header.gross_profit)], ["Margin", margin]].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{l}</div>
            <div className="mt-1 text-xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500">Prices with the same fn_price + fn_estimate_cost as estimates — the seeded estimate is identical. Cost is the operating estimate (no depreciation).</p>

      {/* Lines */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Service</th><th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Detail</th><th className="px-3 py-2 font-medium">Observed</th>
              <th className="px-3 py-2 font-medium text-right">Revenue</th><th className="px-3 py-2 font-medium text-right">Est. cost</th>
              {isDraft && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && <tr><td colSpan={isDraft ? 7 : 6} className="px-3 py-6 text-center text-neutral-500">No lines yet.</td></tr>}
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">{l.service_name ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{l.model_name} <span className="font-mono text-xs text-neutral-400">{l.model_type}</span></td>
                <td className="px-3 py-2 text-neutral-500">{l.description ?? (l.model_type === "formula" ? JSON.stringify(l.measures) : `${l.unit_price} × ${l.measure}`)}</td>
                <td className="px-3 py-2 text-neutral-500">{l.observed_notes ?? "—"}</td>
                <td className="px-3 py-2 text-right">{aed(l.line_total)}</td>
                <td className="px-3 py-2 text-right text-neutral-600">{aed(l.est_cost)}</td>
                {isDraft && <td className="px-3 py-2 text-right">
                  <form action={deleteSurveyLineAction}><input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="survey_id" value={header.id} />
                    <button className="text-xs text-neutral-500 hover:text-red-600">remove</button></form>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isDraft && categories.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="font-medium">Quick add from category</h2>
          <p className="mt-1 text-sm text-neutral-600">Pick a configured category — crew, duration, material cost and price fill in deterministically.</p>
          <form action={addSurveyLineFromCategoryAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="survey_id" value={header.id} />
            <label className="text-sm">
              <span className="text-neutral-600">Category</span>
              <select name="category_id" required className="mt-1 block w-72 rounded-md border border-neutral-300 px-2 py-2 text-sm">
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id} disabled={!c.default_pricing_model_id}>
                    {c.name}{c.property_type ? ` (${c.property_type})` : ""}{!c.default_pricing_model_id ? " — no pricing set" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Add from category</button>
          </form>
        </div>
      )}

      {isDraft ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="font-medium">Add line</h2>
          <LineForm action={addSurveyLineAction} entityId={header.id} idFieldName="survey_id" showObservedNotes
            services={services.map((s) => ({ id: s.id, name: s.name }))}
            models={models.map((m) => ({ id: m.id, name: m.name, model_type: m.model_type, formula_spec: m.formula_spec }))}
            rates={rateProps} />
        </div>
      ) : (
        <p className="text-sm text-neutral-500">This survey is {header.status} — reopen to draft to edit lines.</p>
      )}
    </div>
  );
}
