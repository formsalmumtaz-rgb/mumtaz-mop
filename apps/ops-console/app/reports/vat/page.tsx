import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getVatSummary } from "@/lib/domain/reports";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const yearStart = () => new Date().getFullYear() + "-01-01";
const today = () => new Date().toISOString().slice(0, 10);

export default async function VatPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const from = sp.from || yearStart();
  const to = sp.to || today();
  const tenantId = await getTenantId();
  const vat = await getVatSummary(tenantId, from, to);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-brand underline">← Reports</Link>
        <h1 className="mt-1 text-2xl font-semibold">VAT summary</h1>
        <form className="mt-2 flex items-end gap-2 text-sm">
          <label>From <input type="date" name="from" defaultValue={from} className="ml-1 rounded border border-neutral-300 px-2 py-1" /></label>
          <label>To <input type="date" name="to" defaultValue={to} className="ml-1 rounded border border-neutral-300 px-2 py-1" /></label>
          <button className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50">Apply</button>
        </form>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-4"><div className="text-xs uppercase tracking-wide text-neutral-500">Taxable sales (ex-VAT)</div><div className="mt-1 text-2xl font-semibold">{aed(vat.taxable_sales)}</div></div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4"><div className="text-xs uppercase tracking-wide text-neutral-500">Output VAT</div><div className="mt-1 text-2xl font-semibold">{aed(vat.output_vat)}</div></div>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4"><div className="text-xs uppercase tracking-wide text-indigo-700">Net VAT payable</div><div className="mt-1 text-2xl font-semibold text-indigo-800">{aed(vat.output_vat)}</div></div>
      </div>
      <p className="text-xs text-neutral-500">Output VAT net of credit notes for {from} → {to}. Input VAT (on purchases) is tracked in a later milestone; net payable currently equals output VAT.</p>
    </div>
  );
}
