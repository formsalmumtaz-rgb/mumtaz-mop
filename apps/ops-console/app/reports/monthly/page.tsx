import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { scopedRead } from "@/lib/rls";
import { canSeeProfit } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

// Vision P4 — MONTHLY operations pack. Deterministic aggregates with the
// formula shown; margin figures render only for profit.view holders.
export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const showProfit = await canSeeProfit();
  const month = (sp.month ?? "").match(/^\d{4}-\d{2}$/) ? sp.month! : new Date().toISOString().slice(0, 7);
  const start = `${month}-01`;

  const [topline, ageing, margin, chem, renewals, severe, topCustomers] = await Promise.all([
    scopedRead(tenantId,
      `select (select coalesce(sum(total),0)::float8 from invoices
                where tenant_id=$1 and created_at >= $2::date and created_at < ($2::date + interval '1 month')) as invoiced,
              (select coalesce(sum(amount),0)::float8 from receipts
                where tenant_id=$1 and receipt_date >= $2::date and receipt_date < ($2::date + interval '1 month')) as collected,
              (select coalesce(sum(amount),0)::float8 from expenses
                where tenant_id=$1 and expense_date >= $2::date and expense_date < ($2::date + interval '1 month')) as expenses`,
      [tenantId, start]).then((r) => r.rows[0]),
    scopedRead(tenantId,
      `select aging_bucket, count(*)::int n, coalesce(sum(balance),0)::float8 amt
         from invoice_ar where tenant_id = $1 and balance > 0
        group by aging_bucket order by aging_bucket`, [tenantId]).then((r) => r.rows),
    showProfit
      ? scopedRead(tenantId,
          `select sl.name as division,
                  coalesce(sum(i.total),0)::float8 as revenue,
                  coalesce(sum(jc.total_cost),0)::float8 as cost
             from invoices i
             left join service_lines sl on sl.id = i.service_line_id
             left join job_cost_current jc on jc.job_id = i.job_id
            where i.tenant_id = $1 and i.created_at >= $2::date and i.created_at < ($2::date + interval '1 month')
            group by sl.name order by revenue desc`, [tenantId, start]).then((r) => r.rows)
      : Promise.resolve([]),
    scopedRead(tenantId,
      `select it.name as item,
              coalesce(sum(sm.quantity) filter (where sm.movement_type='consumption'),0)::float8 as consumed,
              coalesce(sum(sm.quantity) filter (where sm.movement_type='receipt'),0)::float8 as purchased,
              u.code as unit
         from stock_movements sm join items it on it.id = sm.item_id
         left join units u on u.id = sm.unit_id
        where sm.tenant_id = $1 and sm.created_at >= $2::date and sm.created_at < ($2::date + interval '1 month')
        group by it.name, u.code
        having sum(sm.quantity) filter (where sm.movement_type='consumption') is not null
            or sum(sm.quantity) filter (where sm.movement_type='receipt') is not null
        order by consumed desc nulls last limit 12`, [tenantId, start]).then((r) => r.rows),
    scopedRead(tenantId,
      `select ct.id, ct.contract_number, cu.trade_name, ct.end_date::text
         from contracts ct join customers cu on cu.id = ct.customer_id
        where ct.tenant_id = $1 and ct.lifecycle_status = 'active'
          and ct.end_date >= $2::date and ct.end_date < ($2::date + interval '2 month')
        order by ct.end_date limit 15`, [tenantId, start]).then((r) => r.rows),
    scopedRead(tenantId,
      `select count(*)::int n from severe_infestation_episodes
        where tenant_id = $1 and resolved_at is null`, [tenantId]).then((r) => r.rows[0]),
    showProfit
      ? scopedRead(tenantId,
          `select cu.id, coalesce(cu.trade_name, cu.legal_name) as name,
                  coalesce(sum(i.total),0)::float8 as revenue
             from invoices i join customers cu on cu.id = i.customer_id
            where i.tenant_id = $1 and i.created_at >= $2::date and i.created_at < ($2::date + interval '1 month')
            group by cu.id, name order by revenue desc limit 10`, [tenantId, start]).then((r) => r.rows)
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Monthly operations pack" description="Revenue, collections, AR ageing, consumption and renewals — deterministic aggregates, formulas stated."
        actions={<form method="get"><input type="month" name="month" defaultValue={month} className="rounded border border-neutral-300 px-2 py-1.5 text-sm" /> <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">View</button></form>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {([["Revenue invoiced", aed(Number(topline.invoiced)), "Σ invoices.total created in the month", "/invoices"],
           ["Collections", aed(Number(topline.collected)), "Σ receipts.amount dated in the month", "/receipts"],
           ["Expenses", aed(Number(topline.expenses)), "Σ expenses.amount dated in the month", "/expenses"]] as [string, string, string, string][]).map(([l, v, f, href]) => (
          <Link key={l} href={href} className="lift block rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand hover:bg-brand/5">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{l}</div>
            <div className="mt-1 text-2xl font-semibold">{v}</div>
            <div className="mt-1 text-[11px] text-neutral-400">{f}</div>
          </Link>
        ))}
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-medium">AR ageing (open balances now) <span className="text-xs font-normal text-neutral-400">invoice_ar view — balance &gt; 0 grouped by bucket</span></div>
        <ul className="divide-y divide-neutral-100">
          {ageing.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">Nothing outstanding.</li>}
          {ageing.map((a: { aging_bucket: string; n: number; amt: number }) => (
            <li key={a.aging_bucket} className="flex justify-between px-4 py-2.5 text-sm">
              <span>{a.aging_bucket} <span className="text-neutral-400">({a.n} invoices)</span></span>
              <Link href="/ar" className="font-medium text-brand underline">{aed(a.amt)}</Link>
            </li>
          ))}
        </ul>
      </section>

      {showProfit && (
        <section className="rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-medium">Gross margin by division <span className="text-xs font-normal text-neutral-400">Σ invoices.total − Σ job_cost_current.total_cost of the invoiced jobs</span></div>
          <ul className="divide-y divide-neutral-100">
            {margin.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">No invoiced work this month.</li>}
            {margin.map((m: { division: string | null; revenue: number; cost: number }) => {
              const gp = m.revenue - m.cost;
              const pct = m.revenue > 0 ? ((gp / m.revenue) * 100).toFixed(1) + "%" : "—";
              return (
                <li key={m.division ?? "—"} className="flex justify-between px-4 py-2.5 text-sm">
                  <span>{m.division ?? "(unassigned)"}</span>
                  <span>{aed(m.revenue)} rev · {aed(gp)} GP · <b>{pct}</b></span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-medium">Chemical consumption vs purchases <span className="text-xs font-normal text-neutral-400">Σ stock_movements by type in the month, per item</span></div>
        <ul className="divide-y divide-neutral-100">
          {chem.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">No stock movement this month.</li>}
          {chem.map((s: { item: string; consumed: number; purchased: number; unit: string | null }) => (
            <li key={s.item} className="flex justify-between px-4 py-2.5 text-sm">
              <span>{s.item}</span>
              <span>used <b>{s.consumed}</b>{s.unit ? ` ${s.unit}` : ""} · bought <b>{s.purchased}</b>{s.unit ? ` ${s.unit}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-medium">Renewals due (next 2 months) <span className="text-xs font-normal text-neutral-400">active contracts by end_date</span></div>
          <ul className="divide-y divide-neutral-100">
            {renewals.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">No contracts ending in the window.</li>}
            {renewals.map((r: { id: string; contract_number: string | null; trade_name: string | null; end_date: string }) => (
              <li key={r.id} className="flex justify-between px-4 py-2.5 text-sm">
                <Link href={`/contracts/${r.id}`} className="text-brand underline">{r.contract_number ?? "(no number)"} — {r.trade_name}</Link>
                <span className="text-neutral-500">{r.end_date}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-sm font-medium">Severe infestation episodes active</div>
          <div className="mt-1 text-3xl font-semibold">{severe.n}</div>
          <p className="mt-1 text-xs text-neutral-400">open severe_infestation_episodes (clause 6 — zero-revenue follow-ups) · <Link href="/contracts" className="text-brand underline">contracts</Link></p>
          {showProfit && topCustomers.length > 0 && (
            <>
              <div className="mt-4 text-sm font-medium">Top customers by revenue (month)</div>
              <ul className="mt-1 space-y-1 text-sm">
                {topCustomers.map((tc: { id: string; name: string; revenue: number }) => (
                  <li key={tc.id} className="flex justify-between">
                    <Link href={`/customers/${tc.id}`} className="text-brand underline">{tc.name}</Link>
                    <span>{aed(tc.revenue)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      <p className="text-xs text-neutral-500">Complaint counts await the complaints module (not built — tracked in ROADMAP). Yearly P&amp;L, trial balance and revenue-by-customer live under Financial reports.</p>
    </div>
  );
}
