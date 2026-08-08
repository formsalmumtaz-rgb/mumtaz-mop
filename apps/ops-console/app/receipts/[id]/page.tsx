import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getReceipt } from "@/lib/domain/receipts";
import { can } from "@/lib/auth";
import { reverseReceiptAction } from "../actions";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };

export default async function ReceiptDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const data = await getReceipt(tenantId, id);
  if (!data) notFound();
  const { header, allocations } = data;
  const reversed = !!header.reversed_at;
  const canReverse = await can("payment.record");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/receipts" className="text-sm text-brand underline">← Receipts</Link>
        <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
          <span className="font-mono">{header.receipt_number ?? "—"}</span>
          {reversed && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-medium text-red-700">Reversed</span>}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {header.customer ?? "—"} · {METHOD_LABEL[header.method] ?? header.method}
          {header.reference && <> · ref {header.reference}</>}
          {header.receipt_date && <> · {header.receipt_date}</>}
        </p>
        {header.others_note && <p className="mt-1 text-sm text-neutral-700">{header.others_note}</p>}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="text-xs uppercase tracking-wide text-neutral-500">Amount received</div>
        <div className={`mt-1 text-2xl font-semibold ${reversed ? "text-neutral-400 line-through" : ""}`}>{aed(header.amount)}</div>
      </div>

      {/* Correction path — receipts are append-only, so a mistake is corrected by
          recording a reversal (bounced cheque, wrong customer, misapplied), never by editing. */}
      {reversed ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <div className="font-medium text-red-800">This receipt was reversed on {header.reversed_at?.slice(0, 10)}.</div>
          {header.reversed_reason && <div className="mt-1 text-red-700">Reason: {header.reversed_reason}</div>}
          <p className="mt-1 text-red-700">Its allocations no longer count toward invoice balances, and a reversing GL entry (Dr AR / Cr Bank) has netted the cash back out. The original record is preserved.</p>
        </div>
      ) : canReverse ? (
        <details className="rounded-lg border border-neutral-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-red-700">Correct this receipt — reverse it</summary>
          <p className="mt-2 text-sm text-neutral-600">
            Receipts are append-only. Reversing records a correction (it does not delete the receipt): any invoice this cleared reverts to unpaid, and a reversing journal entry nets the cash out. Use for a bounced cheque, wrong customer, or misapplied payment.
          </p>
          <form action={reverseReceiptAction} className="mt-3 space-y-2">
            <input type="hidden" name="id" value={header.id} />
            <input name="reason" required placeholder="Reason (e.g. cheque bounced)" className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm" />
            <button className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">Reverse receipt</button>
          </form>
        </details>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr><th className="px-3 py-2 font-medium">Settled invoice</th><th className="px-3 py-2 font-medium text-right">Applied</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {allocations.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2"><Link href={`/invoices/${a.invoice_id}`} className="font-mono text-xs text-brand underline">{a.invoice_number ?? a.invoice_id.slice(0, 8)}</Link></td>
                <td className="px-3 py-2 text-right font-medium">{aed(a.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
