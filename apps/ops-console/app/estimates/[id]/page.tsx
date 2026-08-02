import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { listServiceTypes } from "@/lib/domain/reference";
import { listPricingModels } from "@/lib/domain/pricing";
import { getCostRates } from "@/lib/domain/costconfig";
import { getEstimate } from "@/lib/domain/estimation";
import { EstimateLineForm } from "../EstimateLineForm";
import { addLineAction, deleteLineAction, setStatusAction } from "../actions";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function EstimateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const [data, services, models, rates] = await Promise.all([
    getEstimate(tenantId, id),
    listServiceTypes(tenantId),
    listPricingModels(tenantId),
    getCostRates(tenantId),
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
    draft: [{ s: "quoted", label: "Mark quoted" }],
    quoted: [{ s: "accepted", label: "Accept" }, { s: "rejected", label: "Reject" }, { s: "draft", label: "Back to draft" }],
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
          {(header.status === "quoted" || header.status === "accepted") && (
            <Link href={`/estimates/${header.id}/quotation`} className="rounded border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5">View quotation</Link>
          )}
          {(nextStatuses[header.status] ?? []).map((a) => (
            <form key={a.s} action={setStatusAction}>
              <input type="hidden" name="estimate_id" value={header.id} /><input type="hidden" name="status" value={a.s} />
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
      <p className="text-xs text-neutral-500">Cost is the operating estimate (material + labour + vehicle + optional overhead at standard rates) — no depreciation. Profit preview is indicative.</p>

      {/* Lines */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Service</th><th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 font-medium text-right">Revenue</th><th className="px-3 py-2 font-medium text-right">Est. cost</th>
              {isDraft && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && <tr><td colSpan={isDraft ? 6 : 5} className="px-3 py-6 text-center text-neutral-500">No lines yet.</td></tr>}
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">{l.service_name ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{l.model_name} <span className="font-mono text-xs text-neutral-400">{l.model_type}</span></td>
                <td className="px-3 py-2 text-neutral-500">{l.description ?? (l.model_type === "formula" ? JSON.stringify(l.measures) : `${l.unit_price} × ${l.measure}`)}</td>
                <td className="px-3 py-2 text-right">{aed(l.line_total)}</td>
                <td className="px-3 py-2 text-right text-neutral-600">{aed(l.est_cost)}</td>
                {isDraft && <td className="px-3 py-2 text-right">
                  <form action={deleteLineAction}><input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="estimate_id" value={header.id} />
                    <button className="text-xs text-neutral-500 hover:text-red-600">remove</button></form>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isDraft ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="font-medium">Add line</h2>
          <EstimateLineForm action={addLineAction} estimateId={header.id}
            services={services.map((s) => ({ id: s.id, name: s.name }))}
            models={models.map((m) => ({ id: m.id, name: m.name, model_type: m.model_type, formula_spec: m.formula_spec }))}
            rates={rateProps} />
        </div>
      ) : (
        <p className="text-sm text-neutral-500">This estimate is {header.status} — reopen to draft to edit lines.</p>
      )}
    </div>
  );
}
