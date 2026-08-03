import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listCreditNotes, listIssuedInvoices } from "@/lib/domain/creditnotes";
import { createCreditNoteAction } from "./actions";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_CLASS: Record<string, string> = { draft: "bg-neutral-100 text-neutral-700", issued: "bg-indigo-100 text-indigo-800", cancelled: "bg-red-100 text-red-700" };

export default async function CreditNotesPage() {
  const tenantId = await getTenantId();
  const [notes, invoices] = await Promise.all([listCreditNotes(tenantId), listIssuedInvoices(tenantId)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Credit notes</h1>
        <p className="mt-1 text-sm text-neutral-600">A credit note (full or partial) reduces what a customer owes on an invoice. Refunds are recorded against an issued credit note.</p>
      </div>

      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={notes.length === 0}>
        <summary className="cursor-pointer font-medium">New credit note</summary>
        {invoices.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No issued invoices to credit yet.</p>
        ) : (
          <form action={createCreditNoteAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2"><span className="text-neutral-600">Against invoice</span>
              <select name="invoice_id" required className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
                <option value="">Select an issued invoice…</option>
                {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number ?? i.id.slice(0, 8)} — {i.customer ?? "?"} ({aed(i.total)})</option>)}
              </select></label>
            <label className="text-sm"><span className="text-neutral-600">VAT treatment</span>
              <select name="vat_treatment" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
                <option value="standard">Standard (5%)</option><option value="zero_rated">Zero-rated</option><option value="exempt">Exempt</option><option value="reverse_charge">Reverse charge</option>
              </select></label>
            <label className="text-sm"><span className="text-neutral-600">Reason</span>
              <input name="reason" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
            <div className="sm:col-span-2"><button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">Create draft</button></div>
          </form>
        )}
      </details>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Credit note #</th><th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Invoice</th><th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Total</th><th className="px-3 py-2 font-medium text-right">Refunded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {notes.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">No credit notes yet.</td></tr>}
            {notes.map((n) => (
              <tr key={n.id}>
                <td className="px-3 py-2"><Link href={`/credit-notes/${n.id}`} className="font-mono text-xs text-brand underline">{n.credit_note_number ?? "(draft)"}</Link></td>
                <td className="px-3 py-2">{n.customer ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-neutral-500">{n.invoice_number ?? "—"}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[n.status] ?? ""}`}>{n.status}</span></td>
                <td className="px-3 py-2 text-right font-medium">{aed(n.total)}</td>
                <td className="px-3 py-2 text-right text-neutral-600">{aed(n.refunded)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
