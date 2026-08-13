import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listCustomers } from "@/lib/domain/customers";
import { listEstimates } from "@/lib/domain/estimation";
import { canSeeProfit } from "@/lib/auth";
import { createEstimateAction } from "./actions";

export const dynamic = "force-dynamic";

// DOCUMENT 9 §A: cost/margin rendered only for profit.view holders.
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700", quoted: "bg-blue-100 text-blue-800",
  accepted: "bg-emerald-100 text-emerald-800", rejected: "bg-red-100 text-red-700", expired: "bg-amber-100 text-amber-800",
};

export default async function EstimatesPage() {
  const tenantId = await getTenantId();
  const showProfit = await canSeeProfit();
  const [estimates, customers] = await Promise.all([listEstimates(tenantId), listCustomers(tenantId)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Estimates</h1>
        <p className="mt-1 text-sm text-neutral-600">Survey → estimate → profit preview → quotation. Revenue uses pricing models; cost uses standard rates (deterministic).</p>
      </div>

      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={estimates.length === 0}>
        <summary className="cursor-pointer font-medium">New estimate</summary>
        <form action={createEstimateAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className="text-neutral-600">Customer</span>
            <select name="customer_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.trade_name ?? c.code}</option>)}
            </select></label>
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
            <select name="engagement_type" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option><option value="recurring">Recurring</option><option value="ad_hoc">Ad-hoc</option>
            </select></label>
          <div className="sm:col-span-2"><button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">Create estimate</button></div>
        </form>
      </details>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Customer</th><th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Lines</th>
              <th className="px-3 py-2 font-medium text-right">Revenue</th>
              {showProfit && <><th className="px-3 py-2 font-medium text-right">Est. cost</th>
              <th className="px-3 py-2 font-medium text-right">Gross profit</th><th className="px-3 py-2 font-medium text-right">Margin</th></>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {estimates.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-neutral-500">No estimates yet — create one above.</td></tr>}
            {estimates.map((e) => {
              const margin = e.revenue > 0 ? ((e.gross_profit / e.revenue) * 100).toFixed(1) + "%" : "—";
              return (
                <tr key={e.id}>
                  <td className="px-3 py-2"><Link href={`/estimates/${e.id}`} className="text-brand underline">{e.customer ?? "(no customer)"}</Link></td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[e.status] ?? ""}`}>{e.status}</span></td>
                  <td className="px-3 py-2 text-neutral-600">{e.line_count ?? 0}</td>
                  <td className="px-3 py-2 text-right">{aed(e.revenue)}</td>
                  {showProfit && <><td className="px-3 py-2 text-right text-neutral-600">{aed(e.est_cost)}</td>
                  <td className="px-3 py-2 text-right font-medium">{aed(e.gross_profit)}</td>
                  <td className="px-3 py-2 text-right">{margin}</td></>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
