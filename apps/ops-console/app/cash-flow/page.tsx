import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getCashFlow, type Basis } from "@/lib/domain/cashflow";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ basis?: string }> }) {
  const { basis: b } = await searchParams;
  const basis: Basis = b === "cash" ? "cash" : "accrual";
  const tenantId = await getTenantId();
  const cf = await getCashFlow(tenantId, basis);
  const isAccrual = basis === "accrual";
  const inLabel = isAccrual ? "Revenue recognised" : "Cash in";
  const outLabel = isAccrual ? "Credit notes" : "Refunds (cash out)";
  const netLabel = isAccrual ? "Net revenue" : "Net cash";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cash flow &amp; revenue</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {isAccrual
              ? "Accrual basis — revenue recognised when an invoice is issued (ex-VAT), net of credit notes."
              : "Cash basis — money actually received (receipts) less refunds, by the date it moved."}
            {" "}Separate from profitability.
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-neutral-300 text-sm">
          <Link href="/cash-flow?basis=accrual" className={`px-3 py-1.5 ${isAccrual ? "bg-brand text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}>Accrual</Link>
          <Link href="/cash-flow?basis=cash" className={`px-3 py-1.5 ${!isAccrual ? "bg-brand text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}>Cash</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[[inLabel, cf.inflow], [outLabel, cf.outflow], [netLabel, cf.net]].map(([l, v]) => (
          <div key={l as string} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{l as string}</div>
            <div className="mt-1 text-2xl font-semibold">{aed(v as number)}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 font-medium text-right">{inLabel}</th>
              <th className="px-3 py-2 font-medium text-right">{outLabel}</th>
              <th className="px-3 py-2 font-medium text-right">{netLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {cf.rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-500">No {isAccrual ? "revenue" : "cash"} activity yet.</td></tr>}
            {cf.rows.map((r) => (
              <tr key={r.period}>
                <td className="px-3 py-2 font-mono text-xs">{r.period}</td>
                <td className="px-3 py-2 text-right">{aed(r.inflow)}</td>
                <td className="px-3 py-2 text-right text-neutral-600">{r.outflow > 0 ? aed(r.outflow) : "—"}</td>
                <td className="px-3 py-2 text-right font-medium">{aed(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">VAT is excluded from accrual revenue (it is a liability, not income); cash figures are the actual amounts received/paid.</p>
    </div>
  );
}
