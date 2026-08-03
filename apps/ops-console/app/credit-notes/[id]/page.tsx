import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getCreditNote } from "@/lib/domain/creditnotes";
import { addCreditNoteLineAction, deleteCreditNoteLineAction, issueCreditNoteAction, recordRefundAction } from "../actions";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_CLASS: Record<string, string> = { draft: "bg-neutral-100 text-neutral-700", issued: "bg-indigo-100 text-indigo-800", cancelled: "bg-red-100 text-red-700" };

export default async function CreditNoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const data = await getCreditNote(tenantId, id);
  if (!data) notFound();
  const { header, lines, refunds } = data;
  const isDraft = header.status === "draft";
  const remaining = header.total - header.refunded;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/credit-notes" className="text-sm text-brand underline">← Credit notes</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            <span className="font-mono">{header.credit_note_number ?? "(draft — number on issue)"}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[header.status] ?? ""}`}>{header.status}</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {header.customer ?? "—"}{header.invoice_number && <> · against <Link href={`/invoices/${header.invoice_id}`} className="text-brand underline">{header.invoice_number}</Link></>} · VAT {header.vat_treatment}
          </p>
          {header.reason && <p className="mt-1 text-sm text-neutral-700">{header.reason}</p>}
        </div>
        {isDraft && (
          <form action={issueCreditNoteAction}><input type="hidden" name="cn_id" value={header.id} />
            <button className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Issue →</button></form>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[["Subtotal", aed(header.subtotal)], ["VAT", aed(header.vat_total)], ["Total", aed(header.total)]].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{l}</div><div className="mt-1 text-xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr><th className="px-3 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium text-right">Qty</th><th className="px-3 py-2 font-medium text-right">Unit</th>
              <th className="px-3 py-2 font-medium text-right">VAT</th><th className="px-3 py-2 font-medium text-right">Line</th>{isDraft && <th></th>}</tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && <tr><td colSpan={isDraft ? 7 : 6} className="px-3 py-6 text-center text-neutral-500">No lines yet.</td></tr>}
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 text-neutral-500">{l.line_no}</td><td className="px-3 py-2">{l.description ?? "—"}</td>
                <td className="px-3 py-2 text-right">{l.quantity}</td><td className="px-3 py-2 text-right">{aed(l.unit_price)}</td>
                <td className="px-3 py-2 text-right text-neutral-600">{aed(l.vat_amount)}</td><td className="px-3 py-2 text-right font-medium">{aed(l.line_total)}</td>
                {isDraft && <td className="px-3 py-2 text-right"><form action={deleteCreditNoteLineAction}><input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="cn_id" value={header.id} /><button className="text-xs text-neutral-500 hover:text-red-600">remove</button></form></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isDraft && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="font-medium">Add line</h2>
          <form action={addCreditNoteLineAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input type="hidden" name="cn_id" value={header.id} />
            <input name="description" placeholder="Description" className="rounded border border-neutral-300 px-2 py-2 text-sm sm:col-span-2" />
            <input name="quantity" type="number" min="0" step="any" defaultValue="1" className="rounded border border-neutral-300 px-2 py-2 text-sm" />
            <input name="unit_price" type="number" min="0" step="any" placeholder="Unit price" className="rounded border border-neutral-300 px-2 py-2 text-sm" />
            <button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto sm:justify-self-start">Add line</button>
          </form>
        </div>
      )}

      {/* Refunds */}
      {header.status === "issued" && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="font-medium">Refunds <span className="text-neutral-400">· {aed(header.refunded)} of {aed(header.total)} refunded</span></h2>
          <div className="my-3 space-y-1">
            {refunds.length === 0 && <p className="text-sm text-neutral-500">No refunds yet.</p>}
            {refunds.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded border border-neutral-200 px-3 py-1.5 text-sm">
                <span className="font-mono text-xs">{r.refund_number}</span>
                <span className="text-neutral-600">{r.method}{r.reference ? ` · ${r.reference}` : ""} · {r.refund_date}</span>
                <span className="font-medium">{aed(r.amount)}</span>
              </div>
            ))}
          </div>
          {remaining > 0.005 && (
            <form action={recordRefundAction} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <input type="hidden" name="cn_id" value={header.id} />
              <select name="method" className="rounded border border-neutral-300 px-2 py-1.5 text-sm"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="other">Other</option></select>
              <input name="amount" type="number" min="0" step="0.01" max={remaining} placeholder={`Amount (≤ ${remaining.toFixed(2)})`} className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
              <input name="reference" placeholder="Reference" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
              <button className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">Record refund</button>
              <input name="others_note" placeholder="Note (required if method is other)" className="rounded border border-neutral-300 px-2 py-1.5 text-sm sm:col-span-4" />
            </form>
          )}
        </div>
      )}
    </div>
  );
}
