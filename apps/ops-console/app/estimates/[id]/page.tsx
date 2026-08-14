import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { listServiceTypes, getServiceLineId } from "@/lib/domain/reference";
import { listPricingModels } from "@/lib/domain/pricing";
import { getCostRates } from "@/lib/domain/costconfig";
import { canSeeProfit } from "@/lib/auth";
import { getEstimate, getPricingGuidance, getLineDefaults, ensureBaseLocation } from "@/lib/domain/estimation";
import { listCategories } from "@/lib/domain/categories";
import { LineForm } from "@/components/LineForm";
import { addLineAction, addLineFromCategoryAction, deleteLineAction, setStatusAction, convertToContractAction, acceptAndConvertAction, generateQuotationAction } from "../actions";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function EstimateDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await ensureBaseLocation(tenantId); // one-time geocode of the office pin (no-op after)
  const [data, services, models, rates, categories, guidance, lineDefaults] = await Promise.all([
    getEstimate(tenantId, id),
    listServiceTypes(tenantId),
    listPricingModels(tenantId),
    getCostRates(tenantId),
    listCategories(tenantId, sl),
    getPricingGuidance(tenantId, sl),
    getLineDefaults(tenantId, sl, id),
  ]);
  if (!data) notFound();
  // DOCUMENT 9 §A: operations sees revenue, never margin. Without profit.view the
  // cost/margin figures are not rendered at all (server-side — not hidden UI).
  const showProfit = await canSeeProfit();
  const { header, lines } = data;
  const isDraft = header.status === "draft";
  const margin = header.revenue > 0 ? ((header.gross_profit / header.revenue) * 100).toFixed(1) + "%" : "—";
  // Pricing guidance (Release 1 item 2): suggested revenue at the target margin,
  // and margin at any price the user types (?price=). Pure arithmetic, server-side.
  const tm = guidance.target_margin;
  const suggested = tm != null && tm < 1 && header.est_cost > 0 ? header.est_cost / (1 - tm) : null;
  const tryPrice = sp.price != null && sp.price !== "" && !Number.isNaN(Number(sp.price)) ? Number(sp.price) : null;
  const tryMargin = tryPrice != null && tryPrice > 0 ? ((tryPrice - header.est_cost) / tryPrice) * 100 : null;
  const rateProps = {
    labour: Number(rates.labour_rate ?? 0), vehicle: Number(rates.vehicle_rate ?? 0),
    overheadOn: rates.overhead_enabled, overhead: Number(rates.overhead_rate ?? 0),
  };
  const nextStatuses: Record<string, { s: string; label: string }[]> = {
    quoted: [{ s: "rejected", label: "Reject" }, { s: "draft", label: "Back to draft" }],
    rejected: [{ s: "draft", label: "Reopen" }], expired: [{ s: "draft", label: "Reopen" }], accepted: [],
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/estimates" className="text-sm text-brand underline">← Estimates</Link>
          <h1 className="mt-1 text-2xl font-semibold">{header.customer ?? "(no customer)"}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Status <span className="font-medium">{header.status}</span>
            {header.property_type && <> · {header.property_type}</>}
            {header.engagement_type && <> · {header.engagement_type}</>}
            {header.valid_until && <> · valid until {header.valid_until}</>}
          </p>
        </div>
        <div className="flex gap-2">
          {/* One primary action per stage (flow item 10): a draft estimate's only
              next step is "Generate quotation" — it freezes the snapshot, assigns
              the number, and lands you straight on the quotation. Once generated,
              "View quotation" is available and Accept is primary. */}
          {isDraft && lines.length > 0 && (
            <form action={generateQuotationAction}>
              <input type="hidden" name="estimate_id" value={header.id} />
              <button className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">Generate quotation →</button>
            </form>
          )}
          {!isDraft && (
            <Link href={`/estimates/${header.id}/quotation`} className="rounded border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5">View quotation</Link>
          )}
          {header.status === "quoted" && !header.contract_id && (
            <form action={acceptAndConvertAction}>
              <input type="hidden" name="estimate_id" value={header.id} />
              <button className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Accept &amp; create contract →</button>
            </form>
          )}
          {header.status === "accepted" && !header.contract_id && (
            <form action={convertToContractAction}>
              <input type="hidden" name="estimate_id" value={header.id} />
              <input type="hidden" name="customer_id" value={header.customer_id ?? ""} />
              <button className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Convert to contract →</button>
            </form>
          )}
          {header.contract_id && (
            <Link href={`/contracts/${header.contract_id}`} className="rounded border border-emerald-500 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50">Contract created ✓</Link>
          )}
          {(nextStatuses[header.status] ?? []).map((a) => (
            <form key={a.s} action={setStatusAction}>
              <input type="hidden" name="estimate_id" value={header.id} /><input type="hidden" name="status" value={a.s} />
              <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">{a.label}</button>
            </form>
          ))}
        </div>
      </div>

      {/* Profit preview — cost/margin only for profit.view holders (DOCUMENT 9 §A) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(showProfit
          ? [["Revenue", aed(header.revenue)], ["Est. cost", aed(header.est_cost)], ["Gross profit", aed(header.gross_profit)], ["Margin", margin]]
          : [["Revenue", aed(header.revenue)]]
        ).map(([l, v]) => (
          <div key={l} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{l}</div>
            <div className="mt-1 text-xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      {showProfit && <p className="text-xs text-neutral-500">Cost is the operating estimate (material + labour + vehicle + optional overhead at standard rates) — no depreciation. Profit preview is indicative.</p>}

      {/* Pricing guidance — the engines, surfaced where the decision happens */}
      {showProfit && <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 font-medium">Pricing guidance</h2>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Suggested minimum{tm != null && <> at {(tm * 100).toFixed(0)}% target margin</>}
              {guidance.is_assumed && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title="Target margin is an ASSUMED value — confirm it in Cost setup">ASSUMED</span>
              )}
            </div>
            <div className="mt-1 text-xl font-semibold">
              {suggested != null ? aed(suggested) : "—"}
              {suggested != null && header.revenue > 0 && (
                <span className={`ml-2 text-sm font-medium ${header.revenue >= suggested ? "text-emerald-700" : "text-red-600"}`}>
                  {header.revenue >= suggested ? "current price is above it" : `current price is ${aed(suggested - header.revenue)} below it`}
                </span>
              )}
            </div>
          </div>
          <form method="get" className="flex items-end gap-2">
            <label className="text-sm">
              <span className="text-neutral-600">Margin at price…</span>
              <input name="price" type="number" step="0.01" min="0" defaultValue={tryPrice ?? ""} placeholder="type a price"
                     className="mt-1 w-40 rounded border border-neutral-300 px-2 py-2" />
            </label>
            <button className="rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">Check</button>
            {tryMargin != null && (
              <div className={`rounded px-3 py-2 text-sm font-semibold ${tryMargin >= (tm ?? 0) * 100 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
                {tryMargin.toFixed(1)}% margin · {aed(tryPrice! - header.est_cost)} profit
              </div>
            )}
          </form>
        </div>
      </section>}

      {/* Lines */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Service</th><th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 font-medium text-right">Revenue</th>
              {showProfit && <>
                <th className="px-3 py-2 font-medium text-right">Material</th>
                <th className="px-3 py-2 font-medium text-right">Labour</th>
                <th className="px-3 py-2 font-medium text-right">Est. cost</th>
                <th className="px-3 py-2 font-medium text-right">Margin</th>
              </>}
              {isDraft && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && <tr><td colSpan={(showProfit ? 8 : 4) + (isDraft ? 1 : 0)} className="px-3 py-6 text-center text-neutral-500">No lines yet.</td></tr>}
            {lines.map((l) => {
              const gp = l.line_total - l.est_cost;
              const pct = l.line_total > 0 ? `${((gp / l.line_total) * 100).toFixed(0)}%` : "—";
              return (
              <tr key={l.id}>
                <td className="px-3 py-2">{l.service_name ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{l.model_name} <span className="font-mono text-xs text-neutral-400">{l.model_type}</span></td>
                <td className="px-3 py-2 text-neutral-500">{l.description ?? (l.model_type === "formula" ? JSON.stringify(l.measures) : `${l.unit_price} × ${l.measure}`)}</td>
                <td className="px-3 py-2 text-right">{aed(l.line_total)}</td>
                {showProfit && <>
                  <td className="px-3 py-2 text-right text-neutral-600">{aed(l.est_material_cost)}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{l.est_labour_hours ? `${l.est_labour_hours}h` : "—"}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{aed(l.est_cost)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${gp < 0 ? "text-red-600" : "text-emerald-700"}`}>{pct}</td>
                </>}
                {isDraft && <td className="px-3 py-2 text-right">
                  <form action={deleteLineAction}><input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="estimate_id" value={header.id} />
                    <button className="text-xs text-neutral-500 hover:text-red-600">remove</button></form>
                </td>}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isDraft && categories.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="font-medium">Quick add from category</h2>
          <p className="mt-1 text-sm text-neutral-600">Pick a configured category — crew, duration, material cost and price are filled deterministically from its assumptions.</p>
          <form action={addLineFromCategoryAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="estimate_id" value={header.id} />
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
          <LineForm action={addLineAction} entityId={header.id} idFieldName="estimate_id"
            services={services.map((s) => ({ id: s.id, name: s.name }))}
            models={models.map((m) => ({ id: m.id, name: m.name, model_type: m.model_type, formula_spec: m.formula_spec }))}
            rates={rateProps} defaults={lineDefaults} />
        </div>
      ) : (
        <p className="text-sm text-neutral-500">This estimate is {header.status} — reopen to draft to edit lines.</p>
      )}
    </div>
  );
}
