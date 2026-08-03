import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getArSummary, getCustomerAging, listOutstandingInvoices, AGING_BUCKETS } from "@/lib/domain/ar";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const BUCKET_LABEL: Record<string, string> = { current: "Current", "1-30": "1–30", "31-60": "31–60", "61-90": "61–90", "91-120": "91–120", "120+": "120+" };

export default async function ArPage() {
  const tenantId = await getTenantId();
  const [summary, byCustomer, invoices] = await Promise.all([
    getArSummary(tenantId), getCustomerAging(tenantId), listOutstandingInvoices(tenantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Accounts receivable</h1>
        <p className="mt-1 text-sm text-neutral-600">Outstanding balances net of receipts and credit notes. Invoices are overdue after their due date. Monitoring only — warnings, never blocks.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Outstanding</div>
          <div className="mt-1 text-2xl font-semibold">{aed(summary.outstanding)}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs uppercase tracking-wide text-amber-700">Overdue</div>
          <div className="mt-1 text-2xl font-semibold text-amber-800">{aed(summary.overdue)}</div>
        </div>
      </div>

      {/* Aging buckets */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>{AGING_BUCKETS.map((b) => <th key={b} className="px-3 py-2 font-medium text-right">{BUCKET_LABEL[b]}</th>)}</tr>
          </thead>
          <tbody>
            <tr>{AGING_BUCKETS.map((b) => <td key={b} className="px-3 py-2 text-right font-medium">{aed(summary.buckets[b])}</td>)}</tr>
          </tbody>
        </table>
      </div>

      {/* Customer ageing */}
      <div>
        <h2 className="mb-2 font-medium">By customer</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-neutral-100 text-left text-neutral-600">
              <tr>
                <th className="px-3 py-2 font-medium">Customer</th>
                {AGING_BUCKETS.map((b) => <th key={b} className="px-3 py-2 font-medium text-right">{BUCKET_LABEL[b]}</th>)}
                <th className="px-3 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {byCustomer.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-neutral-500">No outstanding balances.</td></tr>}
              {byCustomer.map((c) => (
                <tr key={c.customer_id}>
                  <td className="px-3 py-2"><Link href={`/customers/${c.customer_id}`} className="text-brand underline">{c.customer ?? "—"}</Link></td>
                  {AGING_BUCKETS.map((b) => <td key={b} className={`px-3 py-2 text-right ${b !== "current" && c.buckets[b] > 0 ? "text-amber-700" : "text-neutral-600"}`}>{c.buckets[b] > 0 ? aed(c.buckets[b]) : "—"}</td>)}
                  <td className="px-3 py-2 text-right font-medium">{aed(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Outstanding invoices */}
      <div>
        <h2 className="mb-2 font-medium">Outstanding invoices <span className="text-neutral-400">({invoices.length})</span></h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-neutral-100 text-left text-neutral-600">
              <tr>
                <th className="px-3 py-2 font-medium">Invoice #</th><th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Due</th><th className="px-3 py-2 font-medium text-right">Overdue (days)</th>
                <th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {invoices.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">Nothing outstanding.</td></tr>}
              {invoices.map((i) => (
                <tr key={i.invoice_id}>
                  <td className="px-3 py-2"><Link href={`/invoices/${i.invoice_id}`} className="font-mono text-xs text-brand underline">{i.invoice_number ?? "—"}</Link></td>
                  <td className="px-3 py-2">{i.customer ?? "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">{i.due_date ?? "—"}</td>
                  <td className={`px-3 py-2 text-right ${i.days_overdue > 0 ? "font-medium text-amber-700" : "text-neutral-400"}`}>{i.days_overdue > 0 ? i.days_overdue : "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">{i.payment_status}</td>
                  <td className="px-3 py-2 text-right font-medium">{aed(i.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
