import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listCustomers } from "@/lib/domain/customers";
import { getCustomerStatement } from "@/lib/domain/reports";
import { requireView } from "@/lib/auth";

export const dynamic = "force-dynamic";
const aed = (n: number) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function CustomerStatementPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  await requireView("report.financial");   // financial report — operations must never see the ledger, cost or margin
  const { customer } = await searchParams;
  const tenantId = await getTenantId();
  const customers = await listCustomers(tenantId);
  const stmt = customer ? await getCustomerStatement(tenantId, customer) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-brand underline">← Reports</Link>
        <h1 className="mt-1 text-2xl font-semibold">Customer statement</h1>
        <form className="mt-2 flex items-end gap-2 text-sm">
          <label>Customer
            <select name="customer" defaultValue={customer} className="ml-1 rounded border border-neutral-300 px-2 py-1">
              <option value="">Select…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.trade_name ?? c.code}</option>)}
            </select></label>
          <button className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50">View</button>
        </form>
      </div>
      {!stmt ? (
        <p className="text-sm text-neutral-500">Choose a customer to see their statement.</p>
      ) : (
        <>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Balance owing — {stmt.customer}</div>
            <div className="mt-1 text-2xl font-semibold">AED {aed(stmt.balance)}</div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-neutral-100 text-left text-neutral-600">
                <tr><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Document</th>
                  <th className="px-3 py-2 font-medium">Ref</th><th className="px-3 py-2 font-medium text-right">Charge</th>
                  <th className="px-3 py-2 font-medium text-right">Payment/credit</th><th className="px-3 py-2 font-medium text-right">Balance</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {stmt.rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">No transactions.</td></tr>}
                {stmt.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-neutral-600">{r.date}</td>
                    <td className="px-3 py-2">{r.doc_type}</td>
                    <td className="px-3 py-2 font-mono text-xs text-neutral-500">{r.reference ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{r.debit ? aed(r.debit) : "—"}</td>
                    <td className="px-3 py-2 text-right">{r.credit ? aed(r.credit) : "—"}</td>
                    <td className="px-3 py-2 text-right font-medium">{aed(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
