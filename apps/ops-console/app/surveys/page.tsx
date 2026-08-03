import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listCustomers } from "@/lib/domain/customers";
import { listTechnicians } from "@/lib/domain/technicians";
import { listSurveys } from "@/lib/domain/survey";
import { createSurveyAction } from "./actions";

export const dynamic = "force-dynamic";

const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700", completed: "bg-emerald-100 text-emerald-800", cancelled: "bg-red-100 text-red-700",
};

export default async function SurveysPage() {
  const tenantId = await getTenantId();
  const [surveys, customers, technicians] = await Promise.all([
    listSurveys(tenantId), listCustomers(tenantId), listTechnicians(tenantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Surveys</h1>
        <p className="mt-1 text-sm text-neutral-600">Site visit → measurements → profit preview → seed an estimate. Prices with the same engine as estimates (deterministic).</p>
      </div>

      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={surveys.length === 0}>
        <summary className="cursor-pointer font-medium">New survey</summary>
        <form action={createSurveyAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className="text-neutral-600">Customer</span>
            <select name="customer_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.trade_name ?? c.code}</option>)}
            </select></label>
          <label className="text-sm"><span className="text-neutral-600">Surveyor</span>
            <select name="surveyor_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select></label>
          <label className="text-sm"><span className="text-neutral-600">Survey date</span>
            <input type="date" name="survey_date" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <label className="text-sm"><span className="text-neutral-600">Property type</span>
            <select name="property_type" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="industrial">Industrial</option>
            </select></label>
          <label className="text-sm sm:col-span-2"><span className="text-neutral-600">Notes</span>
            <input name="notes" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <div className="sm:col-span-2"><button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">Create survey</button></div>
        </form>
      </details>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Customer</th><th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Surveyor</th><th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Lines</th>
              <th className="px-3 py-2 font-medium text-right">Revenue</th><th className="px-3 py-2 font-medium text-right">Gross profit</th>
              <th className="px-3 py-2 font-medium">Estimate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {surveys.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-neutral-500">No surveys yet — create one above.</td></tr>}
            {surveys.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2"><Link href={`/surveys/${s.id}`} className="text-brand underline">{s.customer ?? "(no customer)"}</Link></td>
                <td className="px-3 py-2 text-neutral-600">{s.survey_date}</td>
                <td className="px-3 py-2 text-neutral-600">{s.surveyor ?? "—"}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[s.status] ?? ""}`}>{s.status}</span></td>
                <td className="px-3 py-2 text-neutral-600">{s.line_count ?? 0}</td>
                <td className="px-3 py-2 text-right">{aed(s.revenue)}</td>
                <td className="px-3 py-2 text-right font-medium">{aed(s.gross_profit)}</td>
                <td className="px-3 py-2">{s.estimate_id ? <Link href={`/estimates/${s.estimate_id}`} className="text-brand underline">view</Link> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
