import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getInvoice } from "@/lib/domain/invoices";
import { addInvoiceLineAction, deleteInvoiceLineAction, issueInvoiceAction, cancelInvoiceAction } from "../actions";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700", queued: "bg-blue-100 text-blue-800",
  issued: "bg-indigo-100 text-indigo-800", paid: "bg-emerald-100 text-emerald-800", cancelled: "bg-red-100 text-red-700",
};

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const data = await getInvoice(tenantId, id);
  if (!data) notFound();
  const { header, lines } = data;
  const isDraft = header.status === "draft" || header.status === "queued";
  const canIssue = isDraft && lines.length > 0;
  const canCancel = header.status === "issued" || header.status === "queued" || header.status === "draft";
  // Once issued, an invoice is a posted financial record — it is corrected by a
  // credit note or cancellation (reversing GL), never edited in place.
  const isPosted = header.status === "issued" || header.status === "paid";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/invoices" className="text-sm text-brand underline">← Invoices</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            <span className="font-mono">{header.invoice_number ?? "(draft — number on issue)"}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[header.status] ?? ""}`}>{header.status}</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {header.customer ?? "—"} · VAT: {header.vat_treatment}
            {header.issue_date && <> · issued {header.issue_date}</>}
            {header.due_date && <> · due {header.due_date}</>}
          </p>
          {header.status === "cancelled" && header.cancelled_reason && (
            <p className="mt-1 text-sm text-red-700">Cancelled{header.cancelled_at ? ` ${header.cancelled_at.slice(0, 10)}` : ""}: {header.cancelled_reason}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canIssue && (
            <form action={issueInvoiceAction}><input type="hidden" name="invoice_id" value={header.id} />
              <button className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Issue →</button></form>
          )}
          {canCancel && (
            <form action={cancelInvoiceAction} className="flex items-center gap-1">
              <input type="hidden" name="invoice_id" value={header.id} />
              <input name="reason" placeholder="Cancel reason" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
              <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">Cancel</button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[["Subtotal", aed(header.subtotal)], ["VAT", aed(header.vat_total)], ["Total", aed(header.total)]].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{l}</div>
            <div className="mt-1 text-xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      {isPosted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="font-medium text-amber-900">Correcting this invoice</div>
          <p className="mt-1 text-amber-800">
            An issued invoice is a posted financial record and is never edited. To correct it, {header.status === "issued" && "cancel it (a reversing GL entry backs it out) if nothing has been paid, or "}
            issue a <Link href="/credit-notes" className="font-medium underline">credit note</Link> against it to reduce or refund the amount. The original stays on the ledger; the correction is a new, linked entry.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium text-right">Qty</th><th className="px-3 py-2 font-medium text-right">Unit price</th>
              <th className="px-3 py-2 font-medium text-right">VAT %</th><th className="px-3 py-2 font-medium text-right">VAT</th><th className="px-3 py-2 font-medium text-right">Line total</th>
              {isDraft && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && <tr><td colSpan={isDraft ? 8 : 7} className="px-3 py-6 text-center text-neutral-500">No lines yet.</td></tr>}
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 text-neutral-500">{l.line_no}</td>
                <td className="px-3 py-2">{l.description ?? "—"}</td>
                <td className="px-3 py-2 text-right">{l.quantity}</td>
                <td className="px-3 py-2 text-right">{aed(l.unit_price)}</td>
                <td className="px-3 py-2 text-right text-neutral-600">{l.vat_rate}%</td>
                <td className="px-3 py-2 text-right text-neutral-600">{aed(l.vat_amount)}</td>
                <td className="px-3 py-2 text-right font-medium">{aed(l.line_total)}</td>
                {isDraft && <td className="px-3 py-2 text-right">
                  <form action={deleteInvoiceLineAction}><input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="invoice_id" value={header.id} />
                    <button className="text-xs text-neutral-500 hover:text-red-600">remove</button></form>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isDraft && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="font-medium">Add line</h2>
          <form action={addInvoiceLineAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input type="hidden" name="invoice_id" value={header.id} />
            <input name="description" placeholder="Description" className="rounded border border-neutral-300 px-2 py-2 text-sm sm:col-span-2" />
            <input name="quantity" type="number" min="0" step="any" defaultValue="1" placeholder="Qty" className="rounded border border-neutral-300 px-2 py-2 text-sm" />
            <input name="unit_price" type="number" min="0" step="any" placeholder="Unit price" className="rounded border border-neutral-300 px-2 py-2 text-sm" />
            <button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto sm:justify-self-start">Add line</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">VAT is applied per the invoice treatment ({header.vat_treatment}). Job-linked invoices require a completed service report before they can be issued.</p>
        </div>
      )}
    </div>
  );
}
