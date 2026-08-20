import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getTrialBalance } from "@/lib/domain/reports";
import { requireView } from "@/lib/auth";

export const dynamic = "force-dynamic";
const aed = (n: number) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function TrialBalancePage({ searchParams }: { searchParams: Promise<{ as_of?: string }> }) {
  await requireView("report.financial");   // financial report — operations must never see the ledger, cost or margin
  const { as_of } = await searchParams;
  const tenantId = await getTenantId();
  const tb = await getTrialBalance(tenantId, as_of);
  const balanced = Math.abs(tb.total_debit - tb.total_credit) < 0.005;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-brand underline">← Reports</Link>
        <h1 className="mt-1 text-2xl font-semibold">Trial balance</h1>
        <form className="mt-2 flex items-end gap-2 text-sm">
          <label>As of <input type="date" name="as_of" defaultValue={as_of} className="ml-1 rounded border border-neutral-300 px-2 py-1" /></label>
          <button className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50">Apply</button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr><th className="px-3 py-2 font-medium">Code</th><th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium text-right">Debit</th><th className="px-3 py-2 font-medium text-right">Credit</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {tb.rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-500">No posted entries.</td></tr>}
            {tb.rows.map((r) => (
              <tr key={r.code}>
                <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-3 py-2">{r.name} <span className="text-xs text-neutral-400">({r.account_type})</span></td>
                <td className="px-3 py-2 text-right">{r.debit ? aed(r.debit) : "—"}</td>
                <td className="px-3 py-2 text-right">{r.credit ? aed(r.credit) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-neutral-300 font-semibold">
            <tr><td className="px-3 py-2" colSpan={2}>Total</td><td className="px-3 py-2 text-right">{aed(tb.total_debit)}</td><td className="px-3 py-2 text-right">{aed(tb.total_credit)}</td></tr>
          </tfoot>
        </table>
      </div>
      <p className={`text-sm font-medium ${balanced ? "text-emerald-700" : "text-red-700"}`}>{balanced ? "✓ In balance (debits = credits)" : "⚠ OUT OF BALANCE"}</p>
    </div>
  );
}
