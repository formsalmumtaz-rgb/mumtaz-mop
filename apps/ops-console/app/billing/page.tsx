import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getBillingDashboard, previewUpcoming, type DueContract } from "@/lib/domain/billing";
import { generateNowAction, regenerateMissedAction } from "./actions";

export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function DueTable({ rows, generate }: { rows: DueContract[]; generate: boolean }) {
  if (rows.length === 0) return <p className="px-3 py-4 text-sm text-neutral-500">None.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-neutral-100 text-left text-neutral-600">
        <tr><th className="px-3 py-2 font-medium">Contract</th><th className="px-3 py-2 font-medium">Customer</th>
          <th className="px-3 py-2 font-medium">Frequency</th><th className="px-3 py-2 font-medium">Next date</th>
          <th className="px-3 py-2 font-medium text-right">Amount</th>{generate && <th className="px-3 py-2"></th>}</tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2"><Link href={`/contracts/${r.id}`} className="text-brand underline">{r.contract_number ?? "(no number)"}</Link></td>
            <td className="px-3 py-2">{r.customer ?? "—"}</td>
            <td className="px-3 py-2 text-neutral-600">{r.billing_frequency}</td>
            <td className="px-3 py-2 text-neutral-600">{r.next_invoice_date}</td>
            <td className="px-3 py-2 text-right">{aed(r.amount)}</td>
            {generate && <td className="px-3 py-2 text-right">
              <form action={generateNowAction}><input type="hidden" name="contract_id" value={r.id} />
                <button className="rounded bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-brand-dark">Generate now</button></form>
            </td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Card({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <h2 className="font-medium">{title}</h2><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{count}</span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export default async function BillingPage() {
  const tenantId = await getTenantId();
  const [d, preview] = await Promise.all([getBillingDashboard(tenantId), previewUpcoming(tenantId, 60)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Recurring billing</h1>
          <p className="mt-1 text-sm text-neutral-600">Deterministic invoice generation from contract payment terms. Runs daily; safe to run again anytime.</p>
        </div>
        <form action={regenerateMissedAction}>
          <button className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Regenerate missed billing ▶</button>
        </form>
      </div>

      <Card title="Overdue billing" count={d.overdue.length}><DueTable rows={d.overdue} generate /></Card>
      <Card title="Due today" count={d.dueToday.length}><DueTable rows={d.dueToday} generate /></Card>
      <Card title="Due this week" count={d.dueThisWeek.length}><DueTable rows={d.dueThisWeek} generate /></Card>
      <Card title="Next scheduled (to 60 days)" count={d.upcoming.length}><DueTable rows={d.upcoming} generate={false} /></Card>

      <Card title="Recently generated invoices" count={d.recent.length}>
        {d.recent.length === 0 ? <p className="px-3 py-4 text-sm text-neutral-500">None yet.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-left text-neutral-600"><tr><th className="px-3 py-2 font-medium">Invoice</th><th className="px-3 py-2 font-medium">Customer</th><th className="px-3 py-2 font-medium">Period</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {d.recent.map((r) => (
                <tr key={r.id}><td className="px-3 py-2"><Link href={`/invoices/${r.id}`} className="font-mono text-xs text-brand underline">{r.invoice_number ?? "(draft)"}</Link></td>
                  <td className="px-3 py-2">{r.customer ?? "—"}</td><td className="px-3 py-2 text-neutral-600">{r.billing_period}</td>
                  <td className="px-3 py-2 text-neutral-600">{r.status}</td><td className="px-3 py-2 text-right">{aed(r.total)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Failed generations" count={d.failures.length}>
        {d.failures.length === 0 ? <p className="px-3 py-4 text-sm text-neutral-500">No failures.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-left text-neutral-600"><tr><th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">Contract</th><th className="px-3 py-2 font-medium">Period</th><th className="px-3 py-2 font-medium">Error</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {d.failures.map((f) => (
                <tr key={f.id}><td className="px-3 py-2 text-neutral-500">{f.created_at.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2 font-mono text-xs">{f.contract_id?.slice(0, 8) ?? "—"}</td><td className="px-3 py-2 text-neutral-600">{f.period}</td>
                  <td className="px-3 py-2 text-red-700">{f.error_text}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-xs text-neutral-500">Preview: {preview.length} contract(s) will bill within 60 days. Configure a contract&rsquo;s billing on its detail page.</p>
    </div>
  );
}
