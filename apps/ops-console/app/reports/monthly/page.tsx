import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { scopedRead } from "@/lib/rls";
import { canSeeProfit, requireView } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

// Vision P4 — MONTHLY operations pack. Deterministic aggregates with the
// formula shown; margin figures render only for profit.view holders.
export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireView("report.financial");   // carries cost and margin
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const showProfit = await canSeeProfit();
  const month = (sp.month ?? "").match(/^\d{4}-\d{2}$/) ? sp.month! : new Date().toISOString().slice(0, 7);
  const start = `${month}-01`;

  const [topline, ageing, margin, chem, renewals, severe, topCustomers, fuel, distance, belowTarget] = await Promise.all([
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
    // Item 3B: fuel per vehicle for the month (ledger truth)
    scopedRead(tenantId,
      `select coalesce(v.name, v.code, 'Vehicle') as vehicle,
              sum(f.litres)::float8 as litres, sum(f.amount)::float8 as amount
         from vehicle_fuel_purchases f join vehicles v on v.id = f.vehicle_id
        where f.tenant_id = $1 and f.purchase_date >= $2::date and f.purchase_date < ($2::date + interval '1 month')
        group by vehicle order by amount desc`, [tenantId, start]).then((r) => r.rows),
    // Item 3: distance derived from job GPS captures — Σ haversine between
    // consecutive completed jobs per team per day (no live tracking).
    scopedRead(tenantId,
      `with pts as (
         select j.team_id, j.scheduled_date,
                (j.attributes->>'complete_lat')::float8 as lat,
                (j.attributes->>'complete_lng')::float8 as lng,
                row_number() over (partition by j.team_id, j.scheduled_date order by coalesce(j.completed_at, j.created_at)) as rn
           from jobs j
          where j.tenant_id = $1 and j.status = 'completed'
            and j.scheduled_date >= $2::date and j.scheduled_date < ($2::date + interval '1 month')
            and j.attributes ? 'complete_lat'
       )
       select coalesce(tm.name, 'No team') as team,
              round(sum(st_distancesphere(
                st_setsrid(st_makepoint(a.lng, a.lat), 4326)::geometry,
                st_setsrid(st_makepoint(b.lng, b.lat), 4326)::geometry)) / 1000.0, 1)::float8 as km
         from pts a
         join pts b on b.team_id is not distinct from a.team_id
                   and b.scheduled_date = a.scheduled_date and b.rn = a.rn + 1
         left join teams tm on tm.id = a.team_id
        group by team order by km desc`, [tenantId, start]).then((r) => r.rows).catch(() => []),
    // Contracts running below the 70% target margin (annualised, from job costs)
    showProfit
      ? scopedRead(tenantId,
          `select ct.id, ct.contract_number, cu.trade_name,
                  ct.contract_value::float8 as value,
                  coalesce(sum(jc.total_cost), 0)::float8 as cost_to_date,
                  count(j.id)::int as jobs_done
             from contracts ct
             join customers cu on cu.id = ct.customer_id
             left join jobs j on j.contract_id = ct.id and j.status = 'completed'
             left join job_cost_current jc on jc.job_id = j.id
            where ct.tenant_id = $1 and ct.lifecycle_status = 'active' and ct.contract_value > 0
            group by ct.id, ct.contract_number, cu.trade_name, ct.contract_value
           having count(j.id) > 0
              and 1 - (coalesce(sum(jc.total_cost),0) / nullif(ct.contract_value * count(j.id) /
                    greatest((select count(*) from contract_schedule cs where cs.contract_id = ct.id), 1), 0)) < 0.70
            order by cost_to_date desc limit 10`, [tenantId, start]).then((r) => r.rows).catch(() => [])
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
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-medium">Fuel by vehicle (month) <span className="text-xs font-normal text-neutral-400">Σ vehicle_fuel_purchases</span></div>
          <ul className="divide-y divide-neutral-100">
            {fuel.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">No fuel logged this month.</li>}
            {fuel.map((f: { vehicle: string; litres: number; amount: number }) => (
              <li key={f.vehicle} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{f.vehicle}</span><span><b>{f.litres}</b> L · {aed(f.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-medium">Distance by team (month) <span className="text-xs font-normal text-neutral-400">Σ between consecutive job GPS points per day</span></div>
          <ul className="divide-y divide-neutral-100">
            {distance.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">No GPS-captured jobs yet — distance builds as devices record job locations.</li>}
            {distance.map((d: { team: string; km: number }) => (
              <li key={d.team} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{d.team}</span><span><b>{d.km}</b> km</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {showProfit && belowTarget.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50">
          <div className="border-b border-amber-100 px-4 py-2.5 text-sm font-medium text-amber-900">Contracts running below the 70% target margin <span className="text-xs font-normal text-amber-700">per-visit value vs job costs to date</span></div>
          <ul className="divide-y divide-amber-100">
            {belowTarget.map((b: { id: string; contract_number: string | null; trade_name: string | null; cost_to_date: number; jobs_done: number }) => (
              <li key={b.id} className="flex justify-between px-4 py-2.5 text-sm">
                <Link href={`/contracts/${b.id}`} className="text-brand underline">{b.contract_number ?? "(no number)"} — {b.trade_name}</Link>
                <span>{b.jobs_done} visits · {aed(b.cost_to_date)} cost</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-neutral-500">Complaint counts await the complaints module (not built — tracked in ROADMAP). Yearly P&amp;L, trial balance and revenue-by-customer live under Financial reports.</p>
    </div>
  );
}
