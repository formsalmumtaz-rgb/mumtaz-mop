import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { scopedRead } from "@/lib/rls";
import { PageHeader } from "@/components/ui";
import { requireView } from "@/lib/auth";

// Vision P4 — DAILY operations report. Every tile states its formula and
// drills to the raw rows (traceability principle). Deterministic SQL only.
export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function DailyReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireView("report.view");   // operational report
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const date = (sp.date ?? "").match(/^\d{4}-\d{2}-\d{2}$/) ? sp.date! : new Date().toISOString().slice(0, 10);

  const [jobs, money, stock, att, exc] = await Promise.all([
    scopedRead(tenantId,
      `select count(*) filter (where scheduled_date = $2::date)::int as scheduled,
              count(*) filter (where status = 'completed' and coalesce(completed_at::date, scheduled_date) = $2::date)::int as completed,
              count(*) filter (where status in ('failed','cancelled') and scheduled_date = $2::date)::int as failed
         from jobs where tenant_id = $1`, [tenantId, date]).then((r) => r.rows[0]),
    scopedRead(tenantId,
      `select (select coalesce(sum(total),0)::float8 from invoices where tenant_id=$1 and created_at::date=$2::date) as invoiced,
              (select coalesce(sum(amount),0)::float8 from receipts where tenant_id=$1 and receipt_date=$2::date) as collected,
              (select coalesce(sum(amount),0)::float8 from expenses where tenant_id=$1 and expense_date=$2::date) as expenses`,
      [tenantId, date]).then((r) => r.rows[0]),
    scopedRead(tenantId,
      `select it.name as item, sum(sm.quantity)::float8 as qty, u.code as unit
         from stock_movements sm join items it on it.id = sm.item_id
         left join units u on u.id = sm.unit_id
        where sm.tenant_id = $1 and sm.movement_type = 'consumption' and sm.created_at::date = $2::date
        group by it.name, u.code order by qty desc limit 10`, [tenantId, date]).then((r) => r.rows),
    scopedRead(tenantId,
      `select (select count(distinct technician_id)::int from preflight_checks where tenant_id=$1 and check_date=$2::date) as reported,
              (select count(*)::int from technicians where tenant_id=$1 and coalesce(is_active,true)) as active`,
      [tenantId, date]).then((r) => r.rows[0]),
    scopedRead(tenantId,
      `select (select count(*)::int from outbox_events where tenant_id=$1 and needs_review and processed_at is null) as held,
              (select count(*)::int from outbound_notifications where tenant_id=$1 and status='bounced' and created_at::date=$2::date) as bounced`,
      [tenantId, date]).then((r) => r.rows[0]),
  ]);

  const tiles: { label: string; value: string; formula: string; href: string }[] = [
    { label: "Jobs scheduled", value: String(jobs.scheduled), formula: "count(jobs) where scheduled_date = day", href: `/jobs` },
    { label: "Jobs completed", value: String(jobs.completed), formula: "count(jobs) completed on the day", href: `/jobs?status=completed` },
    { label: "Jobs failed / cancelled", value: String(jobs.failed), formula: "count(jobs) failed|cancelled on the day", href: `/jobs` },
    { label: "Revenue invoiced", value: aed(Number(money.invoiced)), formula: "Σ invoices.total created on the day", href: `/invoices` },
    { label: "Cash collected", value: aed(Number(money.collected)), formula: "Σ receipts.amount dated the day", href: `/receipts` },
    { label: "Expenses", value: aed(Number(money.expenses)), formula: "Σ expenses.amount dated the day", href: `/expenses` },
    { label: "Technician attendance", value: `${att.reported} / ${att.active}`, formula: "distinct pre-flight submissions / active technicians", href: `/technicians` },
    { label: "Held for review", value: String(exc.held), formula: "unprocessed field events flagged needs_review", href: `/field-review` },
    { label: "Bounced emails", value: String(exc.bounced), formula: "outbound notifications bounced on the day", href: `/notifications` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Daily operations" description="Every figure is one deterministic aggregate — the formula is under each tile, the number links to its raw rows."
        actions={<form method="get"><input type="date" name="date" defaultValue={date} className="rounded border border-neutral-300 px-2 py-1.5 text-sm" /> <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">View</button></form>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="lift block rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand hover:bg-brand/5">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{t.label}</div>
            <div className="mt-1 text-3xl font-semibold">{t.value}</div>
            <div className="mt-1 text-[11px] text-neutral-400">{t.formula}</div>
          </Link>
        ))}
      </div>
      <section className="rounded-lg border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-medium">Stock consumed ({stock.length}) <span className="text-xs font-normal text-neutral-400">Σ stock_movements type=consumption on the day, by item</span></div>
        {stock.length === 0 ? <p className="px-4 py-4 text-sm text-neutral-500">No chemical consumption recorded this day.</p> : (
          <ul className="divide-y divide-neutral-100">
            {stock.map((s: { item: string; qty: number; unit: string | null }) => (
              <li key={s.item} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{s.item}</span><span className="font-medium">{s.qty} {s.unit ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-neutral-500">This page is the same computation as the automatic day-close email (Reports → recipient in Settings).</p>
    </div>
  );
}
