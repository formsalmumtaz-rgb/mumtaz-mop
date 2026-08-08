import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { listReceiptsPaged } from "@/lib/domain/receipts";
import { listCustomers } from "@/lib/domain/customers";
import { parseListParams } from "@/lib/list";
import { ListToolbar, Pagination } from "@/components/ListControls";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };

async function goToNew(fd: FormData): Promise<void> {
  "use server";
  const c = String(fd.get("customer_id") ?? "");
  if (c) redirect(`/receipts/new?customer=${c}`);
}

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lp = parseListParams(sp);
  const tenantId = await getTenantId();
  const [{ rows: receipts, total }, customers] = await Promise.all([
    listReceiptsPaged(tenantId, { q: lp.q, limit: lp.pageSize, offset: lp.offset }),
    listCustomers(tenantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <p className="mt-1 text-sm text-neutral-600">One receipt can settle several invoices. Contract invoices may be part-paid; ad-hoc invoices must be paid in full.</p>
      </div>

      <ListToolbar basePath="/receipts" params={sp} showArchived={false} placeholder="Search receipt #, customer, or reference…" />

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
            {receipts.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">{lp.q ? "No receipts match your search." : "No receipts yet."}</td></tr>}
            {receipts.map((r) => (
              <tr key={r.id} className={r.reversed_at ? "opacity-60" : ""}>
                <td className="px-3 py-2">
                  <Link href={`/receipts/${r.id}`} className="font-mono text-xs text-brand underline">{r.receipt_number ?? "—"}</Link>
                  {r.reversed_at && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">reversed</span>}
                </td>
                <td className="px-3 py-2">{r.customer ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{r.receipt_date}</td>
                <td className="px-3 py-2 text-neutral-600">{METHOD_LABEL[r.method] ?? r.method}</td>
                <td className="px-3 py-2 text-neutral-600">{r.allocated_count}</td>
                <td className={`px-3 py-2 text-right font-medium ${r.reversed_at ? "line-through" : ""}`}>{aed(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination basePath="/receipts" params={sp} page={lp.page} pageSize={lp.pageSize} total={total} />
    </div>
  );
}
