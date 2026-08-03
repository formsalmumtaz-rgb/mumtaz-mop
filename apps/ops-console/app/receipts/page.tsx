import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { listReceipts } from "@/lib/domain/receipts";
import { listCustomers } from "@/lib/domain/customers";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };

async function goToNew(fd: FormData): Promise<void> {
  "use server";
  const c = String(fd.get("customer_id") ?? "");
  if (c) redirect(`/receipts/new?customer=${c}`);
}

export default async function ReceiptsPage() {
  const tenantId = await getTenantId();
  const [receipts, customers] = await Promise.all([listReceipts(tenantId), listCustomers(tenantId)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <p className="mt-1 text-sm text-neutral-600">One receipt can settle several invoices. Contract invoices may be part-paid; ad-hoc invoices must be paid in full.</p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <form action={goToNew} className="flex flex-wrap items-end gap-3">
          <label className="text-sm"><span className="text-neutral-600">Record a payment for</span>
            <select name="customer_id" required className="mt-1 block w-64 rounded border border-neutral-300 px-2 py-2">
              <option value="">Select customer…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.trade_name ?? c.code}</option>)}
            </select></label>
          <button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Next →</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Receipt #</th><th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">Invoices</th><th className="px-3 py-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {receipts.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">No receipts yet.</td></tr>}
            {receipts.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2"><Link href={`/receipts/${r.id}`} className="font-mono text-xs text-brand underline">{r.receipt_number ?? "—"}</Link></td>
                <td className="px-3 py-2">{r.customer ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{r.receipt_date}</td>
                <td className="px-3 py-2 text-neutral-600">{METHOD_LABEL[r.method] ?? r.method}</td>
                <td className="px-3 py-2 text-neutral-600">{r.allocated_count}</td>
                <td className="px-3 py-2 text-right font-medium">{aed(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
