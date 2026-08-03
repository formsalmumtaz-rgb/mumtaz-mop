import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { listOpenInvoicesForCustomer } from "@/lib/domain/receipts";
import { getCustomer } from "@/lib/domain/customers";
import { recordReceiptAction } from "../actions";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer } = await searchParams;
  if (!customer) notFound();
  const tenantId = await getTenantId();
  const [cust, open] = await Promise.all([getCustomer(tenantId, customer), listOpenInvoicesForCustomer(tenantId, customer)]);
  if (!cust) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/receipts" className="text-sm text-brand underline">← Receipts</Link>
        <h1 className="mt-1 text-2xl font-semibold">Record payment — {cust.trade_name ?? cust.code}</h1>
        <p className="mt-1 text-sm text-neutral-600">Enter what was received against each open invoice. The receipt amount is the sum of the allocations.</p>
      </div>

      {open.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">This customer has no open invoices to settle.</p>
      ) : (
        <form action={recordReceiptAction} className="space-y-4">
          <input type="hidden" name="customer_id" value={customer} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="text-sm"><span className="text-neutral-600">Date</span>
              <input type="date" name="receipt_date" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
            <label className="text-sm"><span className="text-neutral-600">Method</span>
              <select name="method" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
                <option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="other">Other</option>
              </select></label>
            <label className="text-sm"><span className="text-neutral-600">Reference (cheque/txn)</span>
              <input name="reference" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
            <label className="text-sm"><span className="text-neutral-600">Note (required if "other")</span>
              <input name="others_note" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-neutral-100 text-left text-neutral-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Invoice #</th><th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Due</th><th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-right">Balance</th><th className="px-3 py-2 font-medium text-right">Allocate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {open.map((o) => (
                  <tr key={o.invoice_id}>
                    <td className="px-3 py-2 font-mono text-xs">{o.invoice_number ?? "—"}</td>
                    <td className="px-3 py-2 text-neutral-600">{o.is_contract_invoice ? "contract" : "ad-hoc (full only)"}</td>
                    <td className="px-3 py-2 text-neutral-600">{o.due_date ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-neutral-600">{aed(o.total)}</td>
                    <td className="px-3 py-2 text-right font-medium">{aed(o.balance)}</td>
                    <td className="px-3 py-2 text-right">
                      <input name={`alloc_${o.invoice_id}`} type="number" min="0" step="0.01" max={o.balance}
                             defaultValue={o.is_contract_invoice ? "" : o.balance.toFixed(2)}
                             placeholder="0.00" className="w-28 rounded border border-neutral-300 px-2 py-1 text-right" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Record receipt</button>
        </form>
      )}
    </div>
  );
}
