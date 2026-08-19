import Link from "next/link";
import { RowLink } from "@/components/RowLink";
import { ListToolbar } from "@/components/ListControls";
import { getTenantId } from "@/lib/tenant";
import { listCustomers } from "@/lib/domain/customers";
import { listEstimates } from "@/lib/domain/estimation";
import { listServiceLines, getActiveDivision } from "@/lib/domain/reference";
import { canSeeProfit } from "@/lib/auth";
import { createEstimateAction } from "./actions";

export const dynamic = "force-dynamic";

// DOCUMENT 9 §A: cost/margin rendered only for profit.view holders.
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700", quoted: "bg-blue-100 text-blue-800",
  accepted: "bg-emerald-100 text-emerald-800", rejected: "bg-red-100 text-red-700", expired: "bg-amber-100 text-amber-800",
};

export default async function EstimatesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const showProfit = await canSeeProfit();
  const [allEstimates, customers, serviceLines, activeDivision] = await Promise.all([
    listEstimates(tenantId), listCustomers(tenantId), listServiceLines(tenantId), getActiveDivision(tenantId),
  ]);
  // Search by NUMBER first, then account number, then customer name (§3.2).
  const q = (sp.q ?? "").trim().toLowerCase();
  const estimates = q
    ? allEstimates.filter((e) =>
        (e.estimate_number ?? "").toLowerCase().includes(q)
        || (e.customer_code ?? "").toLowerCase().includes(q)
        || (e.customer ?? "").toLowerCase().includes(q))
    : allEstimates;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Estimates</h1>
        <p className="mt-1 text-sm text-neutral-600">Survey → estimate → profit preview → quotation. Revenue uses pricing models; cost uses standard rates (deterministic).</p>
      </div>

      <ListToolbar basePath="/estimates" params={sp} placeholder="Estimate no., account no. or customer" showArchived={false} />

      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={estimates.length === 0}>
        <summary className="cursor-pointer font-medium">New estimate</summary>
        <form action={createEstimateAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className="text-neutral-600">Customer</span>
            <select name="customer_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.trade_name ?? c.code}</option>)}
            </select></label>
          {/* P0-3: the service being sold is EXPLICIT, prefilled from the active
              division and editable — a cleaning estimate recorded under pest was
              how a cleaning contract came out titled 'Pest Control Agreement'.
              Everything downstream (contract, agreement title, branding, clauses)
              derives from this line. */}
          <label className="text-sm"><span className="text-neutral-600">Service (division)</span>
            <select name="service_line_id" defaultValue={activeDivision.id} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              {serviceLines.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <span className="mt-0.5 block text-xs text-neutral-400">Prefilled from your active division — change it if this estimate is for a different service.</span></label>
          <fieldset className="rounded border border-dashed border-neutral-300 p-3 sm:col-span-2">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">…or a new customer, without leaving the flow</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm"><span className="text-neutral-600">Trade name</span>
                <input name="new_customer_name" placeholder="e.g. Al Noor Restaurant" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
              <label className="text-sm"><span className="text-neutral-600">Phone</span>
                <input name="new_customer_phone" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
              <label className="text-sm"><span className="text-neutral-600">Emirate</span>
                <select name="new_customer_emirate" defaultValue="Sharjah" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
                  {["Sharjah","Dubai","Ajman","Abu Dhabi","Umm Al Quwain","Ras Al Khaimah","Fujairah"].map((e) => <option key={e}>{e}</option>)}
                </select></label>
            </div>
            <input type="hidden" name="new_customer_type" value="B2B" />
            <p className="mt-2 text-xs text-neutral-500">Leave the customer picker empty and fill this instead — details are completed later on the profile.</p>
          </fieldset>

          <label className="text-sm"><span className="text-neutral-600">Valid until</span>
            <input type="date" name="valid_until" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <label className="text-sm"><span className="text-neutral-600">Property type</span>
            <select name="property_type" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="industrial">Industrial</option>
            </select></label>
          <label className="text-sm"><span className="text-neutral-600">Engagement</span>
            {/* Recurring is a CHOICE, never the default (§3.2). Converting this
                estimate used to build a 12-month AMC whatever was chosen here. */}
            <select name="engagement_type" required defaultValue="" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="" disabled>Choose one…</option>
              <option value="ad_hoc">One-off — a single visit</option>
              <option value="recurring">Recurring — repeating maintenance (AMC)</option>
            </select>
            <span className="mt-1 block text-xs text-neutral-500">A one-off becomes a contract with one visit; recurring takes a frequency.</span>
          </label>
          <div className="sm:col-span-2"><button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">Create estimate</button></div>
        </form>
      </details>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Estimate #</th><th className="px-3 py-2 font-medium">Account no.</th>
              <th className="px-3 py-2 font-medium">Customer</th><th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Lines</th>
              <th className="px-3 py-2 font-medium text-right">Revenue</th>
              {showProfit && <><th className="px-3 py-2 font-medium text-right">Est. cost</th>
              <th className="px-3 py-2 font-medium text-right">Gross profit</th><th className="px-3 py-2 font-medium text-right">Margin</th></>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {estimates.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-neutral-500">No estimates yet — create one above.</td></tr>}
            {estimates.map((e) => {
              const margin = e.revenue > 0 ? ((e.gross_profit / e.revenue) * 100).toFixed(1) + "%" : "—";
              return (
                <RowLink key={e.id} href={`/estimates/${e.id}`}>
                  <td className="px-3 py-2 font-mono text-xs font-medium text-brand">{e.estimate_number ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-700">{e.customer_code ?? "—"}</td>
                  <td className="px-3 py-2 text-neutral-700">{e.customer ?? "(no customer)"}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[e.status] ?? ""}`}>{e.status}</span></td>
                  <td className="px-3 py-2 text-neutral-600">{e.line_count ?? 0}</td>
                  <td className="px-3 py-2 text-right">{aed(e.revenue)}</td>
                  {showProfit && <><td className="px-3 py-2 text-right text-neutral-600">{aed(e.est_cost)}</td>
                  <td className="px-3 py-2 text-right font-medium">{aed(e.gross_profit)}</td>
                  <td className="px-3 py-2 text-right">{margin}</td></>}
                </RowLink>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
