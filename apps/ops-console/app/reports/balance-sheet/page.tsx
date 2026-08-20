import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getBalanceSheet } from "@/lib/domain/reports";
import { requireView } from "@/lib/auth";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<{ as_of?: string }> }) {
  await requireView("report.financial");   // financial report — operations must never see the ledger, cost or margin
  const sp = await searchParams;
  const asOf = sp.as_of || today();
  const tenantId = await getTenantId();
  const bs = await getBalanceSheet(tenantId, asOf);
  const balanced = Math.abs(bs.total_assets - bs.liabilities_equity_total) < 0.005;

  const Rows = ({ rows }: { rows: { code: string; name: string; amount: number }[] }) => (
    <>{rows.length === 0 ? <tr><td className="px-3 py-2 text-neutral-500">None</td><td /></tr> : rows.map((r) => <tr key={r.code}><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 text-right">{aed(r.amount)}</td></tr>)}</>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-brand underline">← Reports</Link>
        <h1 className="mt-1 text-2xl font-semibold">Balance sheet</h1>
        <form className="mt-2 flex items-end gap-2 text-sm">
          <label>As of <input type="date" name="as_of" defaultValue={asOf} className="ml-1 rounded border border-neutral-300 px-2 py-1" /></label>
          <button className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50">Apply</button>
        </form>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-3 py-2 text-sm font-medium">Assets</div>
          <table className="w-full text-sm"><tbody className="divide-y divide-neutral-100"><Rows rows={bs.assets} /></tbody>
            <tfoot className="border-t border-neutral-200 font-semibold"><tr><td className="px-3 py-2">Total assets</td><td className="px-3 py-2 text-right">{aed(bs.total_assets)}</td></tr></tfoot></table>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-3 py-2 text-sm font-medium">Liabilities &amp; equity</div>
          <table className="w-full text-sm"><tbody className="divide-y divide-neutral-100">
            <Rows rows={bs.liabilities} />
            <Rows rows={bs.equity} />
            <tr><td className="px-3 py-2">Retained earnings (net profit to date)</td><td className="px-3 py-2 text-right">{aed(bs.retained_earnings)}</td></tr>
          </tbody>
            <tfoot className="border-t border-neutral-200 font-semibold"><tr><td className="px-3 py-2">Total liabilities &amp; equity</td><td className="px-3 py-2 text-right">{aed(bs.liabilities_equity_total)}</td></tr></tfoot></table>
        </div>
      </div>
      <p className={`text-sm font-medium ${balanced ? "text-emerald-700" : "text-red-700"}`}>{balanced ? "✓ Balanced (assets = liabilities + equity)" : "⚠ OUT OF BALANCE"}</p>
    </div>
  );
}
