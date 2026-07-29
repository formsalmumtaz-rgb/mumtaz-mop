import { getTenantId } from "@/lib/tenant";
import {
  getProfitSummary, listProfitRows, listProfitFilterOptions, type ProfitFilters,
} from "@/lib/domain/profitability";

export const dynamic = "force-dynamic";

const aed = (n: number | null) =>
  n == null ? "—" : "AED " + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (n: number | null) => (n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%");

function ConfidenceBadge({ row }: { row: { cost_confidence: string; labour_estimated: boolean; distance_estimated: boolean; fuel_estimated: boolean } }) {
  if (row.cost_confidence === "actual") {
    return <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-300">Actual</span>;
  }
  const why = [row.labour_estimated && "labour", row.distance_estimated && "distance", row.fuel_estimated && "fuel"].filter(Boolean).join(", ");
  return (
    <span title={`Estimated inputs: ${why || "—"}`} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-300">
      ⚠ Estimated{why ? ` (${why})` : ""}
    </span>
  );
}

export default async function ProfitabilityPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const f: ProfitFilters = {
    from: sp.from, to: sp.to, customerId: sp.customer, branchId: sp.branch,
    technicianId: sp.technician, serviceLineId: sp.division, confidence: sp.confidence ?? "all",
  };
  const [summary, rows, opts] = await Promise.all([
    getProfitSummary(tenantId, f),
    listProfitRows(tenantId, f),
    listProfitFilterOptions(tenantId),
  ]);

  const sel = (name: string, value: string | undefined, options: { id: string; name: string | null }[], label: string) => (
    <label className="text-sm">
      <span className="text-neutral-600">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
        <option value="">All</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name ?? "—"}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profitability</h1>
        <p className="mt-1 text-sm text-neutral-600">Per-job revenue, cost and margin. Estimated figures use inferred inputs and are flagged.</p>
      </div>

      {/* Filters */}
      <form className="rounded-lg border border-neutral-200 bg-white p-4" method="get">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <label className="text-sm"><span className="text-neutral-600">From</span>
            <input type="date" name="from" defaultValue={sp.from ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <label className="text-sm"><span className="text-neutral-600">To</span>
            <input type="date" name="to" defaultValue={sp.to ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          {sel("customer", sp.customer, opts.customers, "Customer")}
          {sel("branch", sp.branch, opts.branches, "Branch")}
          {sel("technician", sp.technician, opts.technicians, "Technician")}
          {sel("division", sp.division, opts.divisions, "Division")}
          <label className="text-sm"><span className="text-neutral-600">Confidence</span>
            <select name="confidence" defaultValue={sp.confidence ?? "all"} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="all">All</option>
              <option value="actual">Actual only</option>
              <option value="estimated">Estimated only</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Apply</button>
          <a href="/profitability" className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Reset</a>
        </div>
      </form>

      {summary.jobs === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white px-4 py-6 text-center text-neutral-500">
          No costed jobs match. If you expect data, costing may not be configured yet — see <a href="/cost-config" className="text-brand underline">Cost setup</a>.
        </p>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Revenue", aed(summary.revenue)],
              ["Total cost", aed(summary.total_cost)],
              ["Gross profit", aed(summary.gross_profit)],
              ["Gross margin", pct(summary.gross_margin_pct)],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
                <div className="mt-1 text-xl font-semibold">{val}</div>
              </div>
            ))}
          </div>

          {/* Cost breakdown + confidence */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-neutral-700">
              <span>Material {aed(summary.material)}</span>
              <span>Labour {aed(summary.labour)}</span>
              <span>Vehicle {aed(summary.vehicle)}</span>
              <span>Overhead {aed(summary.overhead)}</span>
            </div>
            <div className="text-neutral-600">
              {summary.jobs} job(s) · margin over {summary.revenue_jobs} with revenue
              {summary.estimated_jobs > 0 && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-300">
                  ⚠ {summary.estimated_jobs} of {summary.jobs} estimated
                </span>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-neutral-100 text-left text-neutral-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Completed</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium text-right">Revenue</th>
                  <th className="px-3 py-2 font-medium text-right">Material</th>
                  <th className="px-3 py-2 font-medium text-right">Labour</th>
                  <th className="px-3 py-2 font-medium text-right">Vehicle</th>
                  <th className="px-3 py-2 font-medium text-right">Overhead</th>
                  <th className="px-3 py-2 font-medium text-right">Total cost</th>
                  <th className="px-3 py-2 font-medium text-right">Gross profit</th>
                  <th className="px-3 py-2 font-medium text-right">Margin</th>
                  <th className="px-3 py-2 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => (
                  <tr key={r.job_id}>
                    <td className="px-3 py-2 text-neutral-600">{r.completed_at?.slice(0, 10) ?? "—"}</td>
                    <td className="px-3 py-2">{r.customer ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{aed(r.revenue)}</td>
                    <td className="px-3 py-2 text-right text-neutral-600">{aed(r.material_cost)}</td>
                    <td className="px-3 py-2 text-right text-neutral-600">{aed(r.labour_cost)}</td>
                    <td className="px-3 py-2 text-right text-neutral-600">{aed(r.vehicle_cost)}</td>
                    <td className="px-3 py-2 text-right text-neutral-600">{aed(r.overhead_cost)}</td>
                    <td className="px-3 py-2 text-right">{aed(r.total_cost)}</td>
                    <td className="px-3 py-2 text-right font-medium">{aed(r.gross_profit)}</td>
                    <td className="px-3 py-2 text-right">{pct(r.gross_margin_pct)}</td>
                    <td className="px-3 py-2"><ConfidenceBadge row={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500">
            Margin is computed over jobs with per-visit revenue. Fixed-period contract revenue is recognised at contract level (per-job revenue may show “—”).
          </p>
        </>
      )}
    </div>
  );
}
