import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getReceipt } from "@/lib/domain/receipts";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };

export default async function ReceiptDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const data = await getReceipt(tenantId, id);
  if (!data) notFound();
  const { header, allocations } = data;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/receipts" className="text-sm text-brand underline">← Receipts</Link>
        <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold"><span className="font-mono">{header.receipt_number ?? "—"}</span></h1>
        <p className="mt-1 text-sm text-neutral-600">
          {header.customer ?? "—"} · {METHOD_LABEL[header.method] ?? header.method}
          {header.reference && <> · ref {header.reference}</>}
          {header.receipt_date && <> · {header.receipt_date}</>}
        </p>
        {header.others_note && <p className="mt-1 text-sm text-neutral-700">{header.others_note}</p>}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="text-xs uppercase tracking-wide text-neutral-500">Amount received</div>
        <div className="mt-1 text-2xl font-semibold">{aed(header.amount)}</div>
      </div>

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
