import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getRevenueByMonth, getRevenueByCustomer } from "@/lib/domain/reports";
import { requireView } from "@/lib/auth";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function RevenuePage() {
  await requireView("report.financial");   // financial report — operations must never see the ledger, cost or margin
  const tenantId = await getTenantId();
  const [byMonth, byCustomer] = await Promise.all([getRevenueByMonth(tenantId), getRevenueByCustomer(tenantId)]);

  const Table = ({ title, head, rows }: { title: string; head: string; rows: { key: string; label: string; revenue: number }[] }) => (
    <div>
      <h2 className="mb-2 font-medium">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[360px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600"><tr><th className="px-3 py-2 font-medium">{head}</th><th className="px-3 py-2 font-medium text-right">Revenue (ex-VAT)</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={2} className="px-3 py-6 text-center text-neutral-500">No revenue yet.</td></tr>}
            {rows.map((r) => <tr key={r.key}><td className="px-3 py-2">{r.label}</td><td className="px-3 py-2 text-right font-medium">{aed(r.revenue)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-brand underline">← Reports</Link>
        <h1 className="mt-1 text-2xl font-semibold">Revenue</h1>
        <p className="mt-1 text-sm text-neutral-600">Recognised revenue (issued invoices ex-VAT, net of credit notes).</p>
      </div>
      <Table title="By month" head="Month" rows={byMonth} />
      <Table title="By customer" head="Customer" rows={byCustomer} />
    </div>
  );
}
