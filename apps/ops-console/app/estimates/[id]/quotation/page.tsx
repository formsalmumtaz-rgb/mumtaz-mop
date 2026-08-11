import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getQuotation } from "@/lib/domain/estimation";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Customer-facing quotation document. Shows revenue only — no internal cost or
// margin ever appears here (retail mode). Printable.
export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const q = await getQuotation(tenantId, id);
  if (!q) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/estimates/${id}`} className="text-sm text-brand underline">← Back to estimate</Link>
        <div className="flex items-center gap-3">
          {q.status !== "quoted" && q.status !== "accepted" && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Not yet quoted — mark the estimate quoted to issue</span>
          )}
          <a href={`/estimates/${id}/quotation/pdf`} target="_blank" rel="noopener noreferrer"
             className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">Download PDF</a>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xl font-semibold">Quotation</div>
            <div className="mt-1 text-sm text-neutral-500">{q.quotation_number ?? "(draft — not issued)"}</div>
          </div>
          <div className="text-right text-sm text-neutral-600">
            {q.quoted_at && <div>Date: {q.quoted_at.slice(0, 10)}</div>}
            {q.valid_until && <div>Valid until: {q.valid_until}</div>}
          </div>
        </div>

        <div className="mt-6 text-sm">
          <div className="text-neutral-500">To</div>
          <div className="font-medium">{q.customer ?? "—"}</div>
          {q.customer_trn && <div className="text-neutral-600">TRN: {q.customer_trn}</div>}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead className="border-b border-neutral-300 text-left text-neutral-600">
            <tr><th className="py-2 font-medium">Description</th><th className="py-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {q.lines.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-neutral-500">No line items.</td></tr>}
            {q.lines.map((l, i) => (
              <tr key={i}><td className="py-2">{l.description}</td><td className="py-2 text-right">{aed(l.amount)}</td></tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-300">
            <tr><td className="py-1 text-right text-neutral-600">Subtotal</td><td className="py-1 text-right">{aed(q.subtotal)}</td></tr>
            <tr><td className="py-1 text-right text-neutral-600">VAT ({q.vat_rate}%)</td><td className="py-1 text-right">{aed(q.vat)}</td></tr>
            <tr><td className="py-2 text-right font-semibold">Total</td><td className="py-2 text-right font-semibold">{aed(q.total)}</td></tr>
          </tfoot>
        </table>

        <p className="mt-8 text-xs text-neutral-400">This quotation is indicative and subject to the terms of service. Prices in AED.</p>
      </div>
    </div>
  );
}
