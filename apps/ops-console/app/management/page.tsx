import { getTenantId } from "@/lib/tenant";
import { requireView } from "@/lib/auth";
import { getManagementProfit, listManagementMonths } from "@/lib/domain/management";

export const dynamic = "force-dynamic";

const aed = (n: number) => "AED " + n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10); // start of 2 months ago
  return { from, to };
}

export default async function ManagementPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from || def.from;
  const to = sp.to || def.to;
  const tenantId = await getTenantId();
  await requireView("profit.view");
  const [summary, months] = await Promise.all([
    getManagementProfit(tenantId, from, to),
    listManagementMonths(tenantId, from, to),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Management Net Profit</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Executive analytics. <span className="font-medium">Operating Profit excludes</span> vehicle depreciation/lease;
          <span className="font-medium"> Net Profit includes</span> it. This is separate from the operational
          <a href="/profitability" className="text-brand underline"> Profitability</a> dashboard, which never includes depreciation/lease.
        </p>
      </div>

      {/* Filters */}
      <form className="rounded-lg border border-neutral-200 bg-white p-4" method="get">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm"><span className="text-neutral-600">From</span>
            <input type="date" name="from" defaultValue={from} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <label className="text-sm"><span className="text-neutral-600">To</span>
            <input type="date" name="to" defaultValue={to} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <div className="flex items-end gap-2">
            <button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Apply</button>
            <a href="/management" className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Reset</a>
          </div>
        </div>
      </form>

      {/* Range KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Operating Profit</div>
          <div className="mt-1 text-xl font-semibold">{aed(summary.operating_profit)}</div>
          <div className="mt-1 text-xs text-neutral-500">before depreciation/lease</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Depreciation / Lease</div>
          <div className="mt-1 text-xl font-semibold text-amber-700">− {aed(summary.depreciation_lease)}</div>
          <div className="mt-1 text-xs text-neutral-500">fleet, management-only</div>
        </div>
        <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Net Profit</div>
          <div className="mt-1 text-xl font-semibold">{aed(summary.net_profit)}</div>
          <div className="mt-1 text-xs text-neutral-500">after depreciation/lease</div>
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        Range revenue {aed(summary.operating_revenue)} · operational cost {aed(summary.operating_cost)} (labour, vehicle running, material, overhead — no depreciation).
      </p>

      {/* Monthly breakdown */}
      <div>
        <h2 className="mb-2 font-medium">By month</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-neutral-100 text-left text-neutral-600">
              <tr>
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 font-medium text-right">Revenue</th>
                <th className="px-3 py-2 font-medium text-right">Operating Profit</th>
                <th className="px-3 py-2 font-medium text-right">Depreciation/Lease</th>
                <th className="px-3 py-2 font-medium text-right">Net Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {months.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500">No months in range.</td></tr>}
              {months.map((m) => (
                <tr key={m.month}>
                  <td className="px-3 py-2 text-neutral-700">{m.month}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{aed(m.operating_revenue)}</td>
                  <td className="px-3 py-2 text-right">{aed(m.operating_profit)}</td>
                  <td className="px-3 py-2 text-right text-amber-700">− {aed(m.depreciation_lease)}</td>
                  <td className="px-3 py-2 text-right font-medium">{aed(m.net_profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-neutral-500">Depreciation/lease is allocated across the active fleet per month (management analytics only). Operational and technician KPIs are unaffected.</p>
    </div>
  );
}
