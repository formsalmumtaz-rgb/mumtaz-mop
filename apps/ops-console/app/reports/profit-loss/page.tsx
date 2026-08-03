import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getProfitAndLoss } from "@/lib/domain/reports";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const yearStart = () => new Date().getFullYear() + "-01-01";
const today = () => new Date().toISOString().slice(0, 10);

export default async function ProfitLossPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const from = sp.from || yearStart();
  const to = sp.to || today();
  const tenantId = await getTenantId();
  const pl = await getProfitAndLoss(tenantId, from, to);

  const Section = ({ title, rows, total }: { title: string; rows: { code: string; name: string; amount: number }[]; total: number }) => (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-3 py-2 text-sm font-medium">{title}</div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-neutral-100">
          {rows.length === 0 && <tr><td className="px-3 py-3 text-center text-neutral-500">None</td></tr>}
          {rows.map((r) => <tr key={r.code}><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 text-right">{aed(r.amount)}</td></tr>)}
        </tbody>
        <tfoot className="border-t border-neutral-200 font-semibold"><tr><td className="px-3 py-2">Total {title.toLowerCase()}</td><td className="px-3 py-2 text-right">{aed(total)}</td></tr></tfoot>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-brand underline">← Reports</Link>
        <h1 className="mt-1 text-2xl font-semibold">Profit &amp; loss</h1>
        <form className="mt-2 flex items-end gap-2 text-sm">
          <label>From <input type="date" name="from" defaultValue={from} className="ml-1 rounded border border-neutral-300 px-2 py-1" /></label>
          <label>To <input type="date" name="to" defaultValue={to} className="ml-1 rounded border border-neutral-300 px-2 py-1" /></label>
          <button className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50">Apply</button>
        </form>
      </div>
      <Section title="Income" rows={pl.income} total={pl.total_income} />
      <Section title="Expenses" rows={pl.expense} total={pl.total_expense} />
      <div className="rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-3 text-lg font-semibold flex justify-between">
        <span>Net {pl.net >= 0 ? "profit" : "loss"}</span><span className={pl.net >= 0 ? "text-emerald-700" : "text-red-700"}>{aed(pl.net)}</span>
      </div>
      <p className="text-xs text-neutral-500">Operating result from the ledger for {from} → {to}. Revenue is ex-VAT; cost postings come from the costing engine.</p>
    </div>
  );
}
