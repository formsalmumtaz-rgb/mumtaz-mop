import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getQuotation, setEstimateStatus } from "@/lib/domain/estimation";
import { acceptAndConvertAction } from "../../actions";
import { amountInWords } from "@mop/documents";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Customer-facing quotation document. Shows revenue only — no internal cost or
// margin ever appears here (retail mode). Printable.
//
// P0-1: a quotation number and frozen snapshot must exist before this page (or
// the PDF) renders anything — otherwise the document prints a literal "(draft)"
// placeholder where a reference number belongs, which must never reach a
// customer. The estimate detail page's "Generate quotation" action already does
// this; this defensive fallback covers any other path that lands here first
// (a direct link, a bookmark) so the page can never render without a real number.
export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  let q = await getQuotation(tenantId, id);
  if (!q) notFound();
  if (q.status === "draft") {
    await setEstimateStatus(tenantId, id, "quoted");
    q = await getQuotation(tenantId, id);
    if (!q) notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/estimates/${id}`} className="text-sm text-brand underline">← Back to estimate</Link>
        <div className="flex items-center gap-3">
          {q.status === "quoted" && (
            <form action={acceptAndConvertAction}>
              <input type="hidden" name="estimate_id" value={id} />
              <button className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Accept &amp; create contract →</button>
            </form>
          )}
          <a href={`/estimates/${id}/quotation/pdf`} target="_blank" rel="noopener noreferrer"
             className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">Download PDF</a>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xl font-semibold">Quotation</div>
            <div className="mt-1 text-sm text-neutral-500">{q.quotation_number}</div>
          </div>
          <div className="text-right text-sm text-neutral-600">
            {q.quoted_at && <div>Date: {q.quoted_at.slice(0, 10)}</div>}
            {q.valid_until && <div>Valid until: {q.valid_until}</div>}
          </div>
        </div>

        <div className="mt-6 flex items-start justify-between text-sm">
          <div>
            <div className="text-neutral-500">To</div>
            <div className="font-medium">{q.customer ?? "—"}</div>
            {q.customer_address_lines.length > 0 && <div className="text-neutral-600">{q.customer_address_lines.join(", ")}</div>}
            {q.customer_trn && <div className="text-neutral-600">TRN: {q.customer_trn}</div>}
          </div>
          {q.account_number && <div className="text-right text-neutral-600">Account no.<div className="font-medium text-neutral-900">{q.account_number}</div></div>}
        </div>

        {q.salutation && <p className="mt-6 text-sm">{q.salutation}</p>}
        {q.intro_paragraph && <p className="mt-2 text-sm text-neutral-700">{q.intro_paragraph}</p>}

        {q.scope_items.length > 0 && (
          <div className="mt-6">
            <h2 className="border-b border-neutral-200 pb-1 text-sm font-semibold uppercase tracking-wide text-brand">Scope of Work</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
              {q.scope_items.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}

        <table className="mt-6 w-full text-sm">
          <thead className="border-b border-neutral-300 text-left text-neutral-600">
            <tr>
              <th className="py-2 font-medium">S/N</th>
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {q.lines.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-500">No line items.</td></tr>}
            {q.lines.map((l, i) => (
              <tr key={i}>
                <td className="py-2">{i + 1}</td>
                <td className="py-2">{l.description}</td>
                <td className="py-2 text-right">{l.qty}</td>
                <td className="py-2 text-right">{aed(l.rate || l.amount)}</td>
                <td className="py-2 text-right">{aed(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-300">
            <tr><td colSpan={4} className="py-1 text-right text-neutral-600">Subtotal</td><td className="py-1 text-right">{aed(q.subtotal)}</td></tr>
            <tr><td colSpan={4} className="py-1 text-right text-neutral-600">VAT ({q.vat_rate}%)</td><td className="py-1 text-right">{aed(q.vat)}</td></tr>
            <tr><td colSpan={4} className="py-2 text-right font-semibold">Total</td><td className="py-2 text-right font-semibold">{aed(q.total)}</td></tr>
          </tfoot>
        </table>
        <p className="mt-1 text-right text-xs italic text-neutral-500">Amount in words: {amountInWords(q.total, "AED")}</p>

        {q.terms.length > 0 && (
          <div className="mt-6">
            <h2 className="border-b border-neutral-200 pb-1 text-sm font-semibold uppercase tracking-wide text-brand">Terms and Conditions</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-700">
              {q.terms.map((t, i) => <li key={i}>{t}</li>)}
            </ol>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-brand">For Mumtaz</div>
            <div className="mt-2 h-16 rounded border border-dashed border-neutral-300" />
            <div className="mt-2 font-medium">{q.signatory_name ?? "—"}</div>
            <div className="text-neutral-500">{q.signatory_title ?? ""}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-brand">Accepted for and on behalf of the Client</div>
            <div className="mt-2 h-16 rounded border border-dashed border-neutral-300" />
            <div className="mt-2 font-medium">{q.customer}</div>
            <div className="text-neutral-500">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}
