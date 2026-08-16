import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listInvoicesPaged } from "@/lib/domain/invoices";
import { listCustomers } from "@/lib/domain/customers";
import { parseListParams } from "@/lib/list";
import { ListToolbar, Pagination, ExportButtons, DateRangeFilter, FilterChips } from "@/components/ListControls";
import { createInvoiceAction } from "./actions";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700", queued: "bg-blue-100 text-blue-800",
  issued: "bg-indigo-100 text-indigo-800", paid: "bg-emerald-100 text-emerald-800", cancelled: "bg-red-100 text-red-700",
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lp = parseListParams(sp);
  const tenantId = await getTenantId();
  const [{ rows: invoices, total }, customers] = await Promise.all([
    listInvoicesPaged(tenantId, { q: lp.q, limit: lp.pageSize, offset: lp.offset }),
    listCustomers(tenantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <p className="mt-1 text-sm text-neutral-600">Numbering is assigned on issue: contract → AMTX, ad-hoc → AMTX/OW. Numbers are never reused; cancelled invoices keep their number.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ListToolbar basePath="/invoices" params={sp} showArchived={false} placeholder="Search invoice #, customer, or status…" />
        <DateRangeFilter basePath="/invoices" params={sp} label="Issued" />
        <div className="ml-auto"><ExportButtons dataset="invoices" params={sp} /></div>
      </div>
      <FilterChips basePath="/invoices" params={sp} name="status" allLabel="All statuses"
        options={[{ value: "draft", label: "Draft" }, { value: "issued", label: "Issued" },
                  { value: "paid", label: "Paid" }, { value: "cancelled", label: "Cancelled" }]} />

      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={invoices.length === 0}>
        <summary className="cursor-pointer font-medium">New manual invoice</summary>
        <form action={createInvoiceAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className="text-neutral-600">Customer</span>
            <select name="customer_id" required className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">Select…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.trade_name ?? c.code}</option>)}
            </select></label>
          <label className="text-sm"><span className="text-neutral-600">VAT treatment</span>
            <select name="vat_treatment" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="standard">Standard (5%)</option><option value="zero_rated">Zero-rated</option><option value="exempt">Exempt</option><option value="reverse_charge">Reverse charge</option>
            </select></label>
          <div className="sm:col-span-2"><button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">Create draft</button></div>
        </form>
      </details>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Invoice #</th><th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Issued</th><th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 font-medium text-right">Subtotal</th><th className="px-3 py-2 font-medium text-right">VAT</th><th className="px-3 py-2 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {invoices.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-neutral-500">{lp.q ? "No invoices match your search." : "No invoices yet."}</td></tr>}
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2"><Link href={`/invoices/${i.id}`} className="font-mono text-xs text-brand underline">{i.invoice_number ?? "(draft)"}</Link></td>
                <td className="px-3 py-2">{i.customer ?? "—"}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[i.status] ?? ""}`}>{i.status}</span></td>
                <td className="px-3 py-2 text-neutral-600">{i.issue_date ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{i.due_date ?? "—"}</td>
                <td className="px-3 py-2 text-right">{aed(i.subtotal)}</td>
                <td className="px-3 py-2 text-right text-neutral-600">{aed(i.vat_total)}</td>
                <td className="px-3 py-2 text-right font-medium">{aed(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination basePath="/invoices" params={sp} page={lp.page} pageSize={lp.pageSize} total={total} />
    </div>
  );
}
