import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getGeneralLedger } from "@/lib/domain/reports";

export const dynamic = "force-dynamic";
const aed = (n: number) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function GeneralLedgerPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const lines = await getGeneralLedger(tenantId, { from: sp.from, to: sp.to });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-brand underline">← Reports</Link>
        <h1 className="mt-1 text-2xl font-semibold">General ledger</h1>
        <form className="mt-2 flex items-end gap-2 text-sm">
          <label>From <input type="date" name="from" defaultValue={sp.from} className="ml-1 rounded border border-neutral-300 px-2 py-1" /></label>
          <label>To <input type="date" name="to" defaultValue={sp.to} className="ml-1 rounded border border-neutral-300 px-2 py-1" /></label>
          <button className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50">Apply</button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Account</th><th className="px-3 py-2 font-medium">Memo</th>
              <th className="px-3 py-2 font-medium text-right">Debit</th><th className="px-3 py-2 font-medium text-right">Credit</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">No posted lines.</td></tr>}
            {lines.map((l, i) => (
              <tr key={l.entry_id + i}>
                <td className="px-3 py-2 text-neutral-600">{l.entry_date}</td>
                <td className="px-3 py-2 text-neutral-500">{l.source_type ?? "—"}</td>
                <td className="px-3 py-2"><span className="font-mono text-xs">{l.code}</span> {l.name}</td>
                <td className="px-3 py-2 text-neutral-500">{l.memo ?? "—"}</td>
                <td className="px-3 py-2 text-right">{l.debit ? aed(l.debit) : "—"}</td>
                <td className="px-3 py-2 text-right">{l.credit ? aed(l.credit) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">Most recent 500 lines. Every line traces to its source document via the source type.</p>
    </div>
  );
}
