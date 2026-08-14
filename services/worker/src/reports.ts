import type { Pool, PoolClient } from "pg";
import { renderEmailHtml } from "./emailTemplate";

// Vision P4 — the DAILY operations report. Every figure is one deterministic
// SQL aggregate over the ledger/operational tables (zero AI in the numbers);
// the formula for each figure is stated alongside it wherever it is shown.

export interface DailyReport {
  date: string;
  jobs_scheduled: number;
  jobs_completed: number;
  jobs_failed: number;
  revenue_invoiced: number;   // Σ invoices.total created that day
  cash_collected: number;     // Σ receipts.amount dated that day
  expenses: number;           // Σ expenses.amount dated that day
  stock_consumed_lines: { item: string; qty: number; unit: string | null }[];
  technicians_reported: number;  // distinct pre-flight submissions
  technicians_active: number;    // active technician headcount
  exceptions: { held_for_review: number; failed_jobs: number; bounced_emails: number };
}

export async function computeDailyReport(c: PoolClient, tenantId: string, date: string): Promise<DailyReport> {
  const one = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>> =>
    (await c.query(sql, [tenantId, date, ...params])).rows[0] ?? {};

  const jobs = await one(
    `select count(*) filter (where scheduled_date = $2::date)::int as scheduled,
            count(*) filter (where status = 'completed' and coalesce(completed_at::date, scheduled_date) = $2::date)::int as completed,
            count(*) filter (where status in ('failed','cancelled') and scheduled_date = $2::date)::int as failed
       from jobs where tenant_id = $1`);
  const money = await one(
    `select (select coalesce(sum(total),0)::float8 from invoices where tenant_id=$1 and created_at::date=$2::date) as invoiced,
            (select coalesce(sum(amount),0)::float8 from receipts where tenant_id=$1 and receipt_date=$2::date) as collected,
            (select coalesce(sum(amount),0)::float8 from expenses where tenant_id=$1 and expense_date=$2::date) as expenses`);
  const { rows: stock } = await c.query(
    `select it.name as item, sum(sm.quantity)::float8 as qty, u.code as unit
       from stock_movements sm join items it on it.id = sm.item_id
       left join units u on u.id = sm.unit_id
      where sm.tenant_id = $1 and sm.movement_type = 'consumption' and sm.created_at::date = $2::date
      group by it.name, u.code order by qty desc limit 10`, [tenantId, date]);
  const att = await one(
    `select (select count(distinct technician_id)::int from preflight_checks where tenant_id=$1 and check_date=$2::date) as reported,
            (select count(*)::int from technicians where tenant_id=$1 and coalesce(is_active,true)) as active`);
  const exc = await one(
    `select (select count(*)::int from outbox_events where tenant_id=$1 and needs_review and processed_at is null) as held,
            (select count(*)::int from jobs where tenant_id=$1 and status='failed' and scheduled_date=$2::date) as failed,
            (select count(*)::int from outbound_notifications where tenant_id=$1 and status='bounced' and created_at::date=$2::date) as bounced`);

  return {
    date,
    jobs_scheduled: Number(jobs.scheduled ?? 0),
    jobs_completed: Number(jobs.completed ?? 0),
    jobs_failed: Number(jobs.failed ?? 0),
    revenue_invoiced: Number(money.invoiced ?? 0),
    cash_collected: Number(money.collected ?? 0),
    expenses: Number(money.expenses ?? 0),
    stock_consumed_lines: stock as DailyReport["stock_consumed_lines"],
    technicians_reported: Number(att.reported ?? 0),
    technicians_active: Number(att.active ?? 0),
    exceptions: {
      held_for_review: Number(exc.held ?? 0),
      failed_jobs: Number(exc.failed ?? 0),
      bounced_emails: Number(exc.bounced ?? 0),
    },
  };
}

const aed = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function dailyReportEmail(r: DailyReport): { subject: string; text: string; html: string } {
  const subject = `Daily operations report — ${r.date}`;
  const rows = [
    { label: "Jobs", value: `${r.jobs_completed} completed of ${r.jobs_scheduled} scheduled${r.jobs_failed ? ` · ${r.jobs_failed} failed` : ""}` },
    { label: "Revenue invoiced", value: aed(r.revenue_invoiced) },
    { label: "Cash collected", value: aed(r.cash_collected) },
    { label: "Expenses", value: aed(r.expenses) },
    { label: "Attendance", value: `${r.technicians_reported} of ${r.technicians_active} technicians reported (pre-flight)` },
    ...(r.stock_consumed_lines.length
      ? [{ label: "Stock consumed", value: r.stock_consumed_lines.map((s) => `${s.item} ${s.qty}${s.unit ? " " + s.unit : ""}`).join(" · ") }]
      : []),
    { label: "Exceptions", value: `${r.exceptions.held_for_review} held for review · ${r.exceptions.failed_jobs} failed jobs · ${r.exceptions.bounced_emails} bounced emails` },
  ];
  const text =
`Daily operations report — ${r.date}

Jobs: ${r.jobs_completed}/${r.jobs_scheduled} completed${r.jobs_failed ? `, ${r.jobs_failed} failed` : ""}
Revenue invoiced: ${aed(r.revenue_invoiced)}
Cash collected: ${aed(r.cash_collected)}
Expenses: ${aed(r.expenses)}
Attendance: ${r.technicians_reported}/${r.technicians_active} technicians reported
Exceptions: ${r.exceptions.held_for_review} held for review, ${r.exceptions.failed_jobs} failed jobs, ${r.exceptions.bounced_emails} bounced emails

Figures come straight from the ledger and job records (Art. III). Full detail: /reports/daily`;
  const html = renderEmailHtml({
    serviceLineCode: null,
    title: `Daily operations report — ${r.date}`,
    paragraphs: ["Here is today's operations summary. Every figure is computed directly from the ledger and job records — nothing estimated."],
    card: { heading: "Today at a glance", rows },
    footnote: "Full detail with drill-downs: Reports → Daily operations in the console.",
  });
  return { subject, text, html };
}

// Queue the day-close email (idempotent per tenant+date via subject match) —
// called from the notification sweep; fires once the Dubai clock passes 17:00.
export async function queueDailyReports(c: PoolClient): Promise<number> {
  const { rows: due } = await c.query(
    `select t.id as tenant_id,
            (now() at time zone 'Asia/Dubai')::date::text as d,
            (select value #>> '{}' from settings s where s.tenant_id = t.id and s.key = 'reports.daily_recipient' limit 1) as rcpt
       from tenants t
      where extract(hour from now() at time zone 'Asia/Dubai') >= 17`);
  let queued = 0;
  for (const t of due) {
    if (!t.rcpt) continue;
    const subject = `Daily operations report — ${t.d}`;
    const { rows: dup } = await c.query(
      `select 1 from outbound_notifications where tenant_id = $1 and kind = 'daily_report' and subject = $2`,
      [t.tenant_id, subject]);
    if (dup.length) continue;
    const r = await computeDailyReport(c, t.tenant_id, t.d);
    const mail = dailyReportEmail(r);
    await c.query(
      `insert into outbound_notifications (tenant_id, kind, to_email, subject, body_text, body_html, status)
       values ($1, 'daily_report', $2, $3, $4, $5, 'queued')`,
      [t.tenant_id, t.rcpt, mail.subject, mail.text, mail.html]);
    queued++;
  }
  return queued;
}

export async function runDailyReportNow(pool: Pool, tenantId: string, date: string): Promise<DailyReport> {
  const c = await pool.connect();
  try {
    return await computeDailyReport(c, tenantId, date);
  } finally {
    c.release();
  }
}
