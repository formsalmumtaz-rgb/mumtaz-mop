import type { Pool, PoolClient } from "pg";
import { renderEmailHtml } from "./emailTemplate";

// Vision P4 — the DAILY operations report. Every figure is one deterministic
// SQL aggregate over the ledger/operational tables (zero AI in the numbers);
// the formula for each figure is stated alongside it wherever it is shown.

export interface DailyReport {
  date: string;   // the last day of the period (the day itself for a daily report)
  from: string;
  to: string;
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

// A daily report is the one-day case of a period report — one implementation,
// so the day-close email and the weekly/yearly packs can never drift apart.
export async function computeDailyReport(c: PoolClient, tenantId: string, date: string): Promise<DailyReport> {
  return computeRangeReport(c, tenantId, date, date);
}

export async function computeRangeReport(c: PoolClient, tenantId: string, from: string, to: string): Promise<DailyReport> {
  const one = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>> =>
    (await c.query(sql, [tenantId, from, to, ...params])).rows[0] ?? {};

  const jobs = await one(
    `select count(*) filter (where scheduled_date between $2::date and $3::date)::int as scheduled,
            count(*) filter (where status = 'completed'
                              and coalesce(completed_at::date, scheduled_date) between $2::date and $3::date)::int as completed,
            count(*) filter (where status in ('failed','cancelled') and scheduled_date between $2::date and $3::date)::int as failed
       from jobs where tenant_id = $1`);
  const money = await one(
    `select (select coalesce(sum(total),0)::float8 from invoices where tenant_id=$1 and created_at::date between $2::date and $3::date) as invoiced,
            (select coalesce(sum(amount),0)::float8 from receipts where tenant_id=$1 and receipt_date between $2::date and $3::date) as collected,
            (select coalesce(sum(amount),0)::float8 from expenses where tenant_id=$1 and expense_date between $2::date and $3::date) as expenses`);
  const { rows: stock } = await c.query(
    `select it.name as item, sum(sm.quantity)::float8 as qty, u.code as unit
       from stock_movements sm join items it on it.id = sm.item_id
       left join units u on u.id = sm.unit_id
      where sm.tenant_id = $1 and sm.movement_type = 'consumption'
        and sm.created_at::date between $2::date and $3::date
      group by it.name, u.code order by qty desc limit 10`, [tenantId, from, to]);
  const att = await one(
    `select (select count(distinct technician_id)::int from preflight_checks
              where tenant_id=$1 and check_date between $2::date and $3::date) as reported,
            (select count(*)::int from technicians where tenant_id=$1 and coalesce(is_active,true)) as active`);
  const exc = await one(
    `select (select count(*)::int from outbox_events where tenant_id=$1 and needs_review and processed_at is null) as held,
            (select count(*)::int from jobs where tenant_id=$1 and status='failed'
              and scheduled_date between $2::date and $3::date) as failed,
            (select count(*)::int from outbound_notifications where tenant_id=$1 and status='bounced'
              and created_at::date between $2::date and $3::date) as bounced`);

  return {
    date: to,
    from,
    to,
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

export function dailyReportEmail(r: DailyReport, analysis: string[] = []): { subject: string; text: string; html: string } {
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
  const analysisText = analysis.length ? `\n\nAnalysis (rule-based):\n${analysis.map((a) => `- ${a}`).join("\n")}` : "";
  const text =
`Daily operations report — ${r.date}

Jobs: ${r.jobs_completed}/${r.jobs_scheduled} completed${r.jobs_failed ? `, ${r.jobs_failed} failed` : ""}
Revenue invoiced: ${aed(r.revenue_invoiced)}
Cash collected: ${aed(r.cash_collected)}
Expenses: ${aed(r.expenses)}
Attendance: ${r.technicians_reported}/${r.technicians_active} technicians reported
Exceptions: ${r.exceptions.held_for_review} held for review, ${r.exceptions.failed_jobs} failed jobs, ${r.exceptions.bounced_emails} bounced emails

${analysisText}

Figures come straight from the ledger and job records (Art. III). Full detail: /reports/daily`;
  const html = renderEmailHtml({
    serviceLineCode: null,
    title: `Daily operations report — ${r.date}`,
    paragraphs: [
      "Here is today's operations summary. Every figure is computed directly from the ledger and job records — nothing estimated.",
      ...(analysis.length ? ["Rule-based analysis: " + analysis.join(" ")] : []),
    ],
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
    const analysis = await computeDailyAnalysis(c, t.tenant_id, r);
    const mail = dailyReportEmail(r, analysis);
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

// ── Item 8: the detailed Excel pack attached to the daily report email ───────
// One sheet per fact table for the day — the raw rows behind every figure.
// Deterministic queries; zero AI in the numbers.
export async function buildDailyExcel(c: PoolClient, tenantId: string, date: string): Promise<Buffer> {
  return buildRangeExcel(c, tenantId, date, date);
}

export async function buildRangeExcel(c: PoolClient, tenantId: string, from: string, to: string): Promise<Buffer> {
  const mod = (await import("exceljs")) as unknown as { default?: unknown };
  const ExcelJS = (mod.default ?? mod) as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mumtaz Operations Platform";

  const addSheet = (name: string, columns: { header: string; key: string; width?: number }[], rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns;
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8A1E2E" } };
    for (const r of rows) ws.addRow(r);
  };

  const [jobs, invoices, receipts, expenses, stock] = await Promise.all([
    c.query(
      `select j.scheduled_date::text as date, cu.trade_name as customer, b.name as site,
              st.name as service, j.status,
              to_char(coalesce(j.device_started_at, j.started_at), 'HH24:MI') as time_in,
              to_char(coalesce(j.device_completed_at, j.completed_at), 'HH24:MI') as time_out
         from jobs j
         join customers cu on cu.id = j.customer_id
         left join customer_branches b on b.id = j.branch_id
         left join service_types st on st.id = j.service_type_id
        where j.tenant_id = $1 and (j.scheduled_date between $2::date and $3::date
                                or coalesce(j.completed_at::date, '1900-01-01') between $2::date and $3::date)
        order by j.scheduled_date, j.scheduled_start nulls last`, [tenantId, from, to]),
    c.query(
      `select i.invoice_number, cu.trade_name as customer, i.status,
              i.subtotal::float8 as subtotal, i.vat_total::float8 as vat, i.total::float8 as total
         from invoices i join customers cu on cu.id = i.customer_id
        where i.tenant_id = $1 and i.created_at::date between $2::date and $3::date
        order by i.created_at`, [tenantId, from, to]),
    c.query(
      `select r.receipt_number, cu.trade_name as customer, r.method, r.amount::float8 as amount
         from receipts r left join customers cu on cu.id = r.customer_id
        where r.tenant_id = $1 and r.receipt_date between $2::date and $3::date
        order by r.created_at`, [tenantId, from, to]),
    c.query(
      `select e.expense_date::text as date, coalesce(t.full_name, t.code) as technician,
              e.amount::float8 as amount, e.description, e.status
         from expenses e left join technicians t on t.id = e.technician_id
        where e.tenant_id = $1 and e.expense_date between $2::date and $3::date
        order by e.created_at`, [tenantId, from, to]),
    c.query(
      `select it.name as item, sm.movement_type, sm.quantity::float8 as qty, u.code as unit,
              cu.trade_name as job_customer
         from stock_movements sm
         join items it on it.id = sm.item_id
         left join units u on u.id = sm.unit_id
         left join jobs j on j.id = sm.job_id
         left join customers cu on cu.id = j.customer_id
        where sm.tenant_id = $1 and sm.created_at::date between $2::date and $3::date
        order by sm.created_at`, [tenantId, from, to]),
  ]);

  addSheet("Jobs", [
    { header: "Date", key: "date", width: 12 }, { header: "Customer", key: "customer", width: 28 },
    { header: "Site", key: "site", width: 22 }, { header: "Service", key: "service", width: 20 },
    { header: "Status", key: "status", width: 12 }, { header: "Time in", key: "time_in", width: 9 },
    { header: "Time out", key: "time_out", width: 9 },
  ], jobs.rows);
  addSheet("Invoices", [
    { header: "Invoice no.", key: "invoice_number", width: 16 }, { header: "Customer", key: "customer", width: 28 },
    { header: "Status", key: "status", width: 10 }, { header: "Subtotal", key: "subtotal", width: 12 },
    { header: "VAT", key: "vat", width: 10 }, { header: "Total", key: "total", width: 12 },
  ], invoices.rows);
  addSheet("Receipts", [
    { header: "Receipt no.", key: "receipt_number", width: 16 }, { header: "Customer", key: "customer", width: 28 },
    { header: "Method", key: "method", width: 12 }, { header: "Amount", key: "amount", width: 12 },
  ], receipts.rows);
  addSheet("Expenses", [
    { header: "Date", key: "date", width: 12 }, { header: "Technician", key: "technician", width: 22 },
    { header: "Amount", key: "amount", width: 12 }, { header: "Description", key: "description", width: 30 },
    { header: "Status", key: "status", width: 12 },
  ], expenses.rows);
  addSheet("Stock movements", [
    { header: "Item", key: "item", width: 26 }, { header: "Type", key: "movement_type", width: 14 },
    { header: "Qty", key: "qty", width: 10 }, { header: "Unit", key: "unit", width: 8 },
    { header: "Job customer", key: "job_customer", width: 26 },
  ], stock.rows);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── Item 8: deterministic, rule-based ANALYSIS for the report emails ─────────
// What happened / what's wrong / what could improve — every flag a fixed rule
// over the same tables the figures come from. No AI in any number or flag.
export async function computeDailyAnalysis(c: PoolClient, tenantId: string, r: DailyReport): Promise<string[]> {
  const flags: string[] = [];
  if (r.jobs_scheduled > 0 && r.jobs_completed < r.jobs_scheduled) {
    flags.push(`${r.jobs_scheduled - r.jobs_completed} of ${r.jobs_scheduled} scheduled jobs not completed.`);
  }
  if (r.jobs_failed > 0) flags.push(`${r.jobs_failed} job(s) failed or cancelled — review the causes.`);
  if (r.exceptions.held_for_review > 0) flags.push(`${r.exceptions.held_for_review} field event(s) held for review (revoked device or clock issue).`);
  if (r.exceptions.bounced_emails > 0) flags.push(`${r.exceptions.bounced_emails} customer email(s) bounced — fix the addresses.`);
  const { rows: overdue } = await c.query(
    `select count(*)::int n, coalesce(sum(balance),0)::float8 amt from invoice_ar
      where tenant_id = $1 and balance > 0 and days_overdue > 0`, [tenantId]);
  if (overdue[0].n > 0) flags.push(`${overdue[0].n} invoice(s) past due totalling AED ${Number(overdue[0].amt).toFixed(2)}.`);
  const { rows: att } = await c.query(
    `select count(*)::int n from contract_attestation_alerts where tenant_id = $1 and is_overdue`, [tenantId]).catch(() => ({ rows: [{ n: 0 }] }));
  if (att[0].n > 0) flags.push(`${att[0].n} contract(s) with OVERDUE municipality attestation — legal exposure.`);
  const { rows: varc } = await c.query(
    `select count(*)::int n from preflight_stock_variance
      where tenant_id = $1 and check_date = $2::date and abs(variance_qty) > 0`, [tenantId, r.date]).catch(() => ({ rows: [{ n: 0 }] }));
  if (varc[0].n > 0) flags.push(`${varc[0].n} declared-stock variance(s) at pre-flight today — check the van counts.`);
  if (flags.length === 0) flags.push("No exceptions triggered by today's rules.");
  return flags;
}

// ── Item 4: weekly + yearly packs ───────────────────────────────────────────
// The same deterministic figures over a longer window, plus a comparison with
// the previous equivalent period. Cadences: weekly on Monday (the week just
// ended), yearly on 1 January (the year just ended). Monthly is available on
// demand from the console. Every cadence is idempotent by subject.

// §3.11 asks for daily / monthly / QUARTERLY / HALF-YEARLY / yearly packs.
// Quarterly and half-yearly were missing entirely.
export type Period = "daily" | "weekly" | "monthly" | "quarterly" | "half_yearly" | "yearly";

export interface PeriodRange { period: Period; from: string; to: string; label: string }

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const shiftDays = (d: string, n: number) => isoDate(new Date(Date.parse(d + "T00:00:00Z") + n * 864e5));

// The period that ENDED most recently before `today` (Asia/Dubai date string).
export function previousPeriod(period: Period, today: string): PeriodRange {
  if (period === "daily") {
    const d = shiftDays(today, -1);
    return { period, from: d, to: d, label: d };
  }
  if (period === "weekly") {
    // Monday-start weeks; on a Monday this is last Monday..Sunday.
    const dow = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7; // 0 = Monday
    const thisMonday = shiftDays(today, -dow);
    const from = shiftDays(thisMonday, -7), to = shiftDays(thisMonday, -1);
    return { period, from, to, label: `${from} to ${to}` };
  }
  if (period === "monthly") {
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
    const from = isoDate(new Date(Date.UTC(y, m - 2, 1)));
    const to = isoDate(new Date(Date.UTC(y, m - 1, 0)));
    return { period, from, to, label: from.slice(0, 7) };
  }
  if (period === "quarterly") {
    // the quarter that just ended, on calendar quarters
    const y0 = Number(today.slice(0, 4)), m0 = Number(today.slice(5, 7));
    const qIndex = Math.floor((m0 - 1) / 3);              // 0..3 for the CURRENT quarter
    const py = qIndex === 0 ? y0 - 1 : y0;
    const pq = qIndex === 0 ? 3 : qIndex - 1;             // the one before it
    const from = isoDate(new Date(Date.UTC(py, pq * 3, 1)));
    const to = isoDate(new Date(Date.UTC(py, pq * 3 + 3, 0)));
    return { period, from, to, label: `Q${pq + 1} ${py}` };
  }
  if (period === "half_yearly") {
    const y0 = Number(today.slice(0, 4)), m0 = Number(today.slice(5, 7));
    const hIndex = m0 <= 6 ? 0 : 1;
    const py = hIndex === 0 ? y0 - 1 : y0;
    const ph = hIndex === 0 ? 1 : 0;
    const from = isoDate(new Date(Date.UTC(py, ph * 6, 1)));
    const to = isoDate(new Date(Date.UTC(py, ph * 6 + 6, 0)));
    return { period, from, to, label: `H${ph + 1} ${py}` };
  }
  const y = Number(today.slice(0, 4)) - 1;
  return { period: "yearly", from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
}

// The period immediately before a given range — the comparison window. Same
// length for weekly/daily; the previous calendar month/year otherwise.
function comparisonRange(r: PeriodRange): { from: string; to: string } {
  if (r.period === "monthly") {
    const y = Number(r.from.slice(0, 4)), m = Number(r.from.slice(5, 7));
    return { from: isoDate(new Date(Date.UTC(y, m - 2, 1))), to: isoDate(new Date(Date.UTC(y, m - 1, 0))) };
  }
  if (r.period === "yearly") {
    const y = Number(r.from.slice(0, 4)) - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  // quarterly and half-yearly compare against the equal-length window immediately
  // before, which the day-count fallback below already produces correctly.
  const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 864e5) + 1;
  return { from: shiftDays(r.from, -days), to: shiftDays(r.from, -1) };
}

const TITLES: Record<Period, string> = {
  daily: "Daily operations report", weekly: "Weekly operations report",
  monthly: "Monthly operations report", quarterly: "Quarterly operations report",
  half_yearly: "Half-year operations report", yearly: "Annual operations report",
};

export interface PeriodReport { range: PeriodRange; current: DailyReport; previous: DailyReport }

export async function computePeriodReport(c: PoolClient, tenantId: string, range: PeriodRange): Promise<PeriodReport> {
  const cmp = comparisonRange(range);
  const [current, previous] = await Promise.all([
    computeRangeReport(c, tenantId, range.from, range.to),
    computeRangeReport(c, tenantId, cmp.from, cmp.to),
  ]);
  return { range, current, previous };
}

const delta = (now: number, before: number): string => {
  if (before === 0) return now === 0 ? "no change" : "no comparable figure last period";
  const pct = ((now - before) / Math.abs(before)) * 100;
  const dir = pct >= 0 ? "up" : "down";
  return `${dir} ${Math.abs(pct).toFixed(0)}% on the previous period`;
};

// Rule-based analysis for a period: movement against the previous period plus
// the standing exception rules. Fixed rules over the same tables the figures
// come from — no model call anywhere near a number.
export async function computePeriodAnalysis(c: PoolClient, tenantId: string, p: PeriodReport): Promise<string[]> {
  const { current: r, previous: prev } = p;
  const flags: string[] = [];
  flags.push(`Jobs completed: ${r.jobs_completed} (${delta(r.jobs_completed, prev.jobs_completed)}).`);
  flags.push(`Revenue invoiced: ${aed(r.revenue_invoiced)} (${delta(r.revenue_invoiced, prev.revenue_invoiced)}).`);
  flags.push(`Cash collected: ${aed(r.cash_collected)} (${delta(r.cash_collected, prev.cash_collected)}).`);
  if (r.expenses > 0) flags.push(`Expenses: ${aed(r.expenses)} (${delta(r.expenses, prev.expenses)}).`);
  if (r.revenue_invoiced > 0 && r.expenses > r.revenue_invoiced * 0.3) {
    flags.push(`Expenses are ${((r.expenses / r.revenue_invoiced) * 100).toFixed(0)}% of invoiced revenue this period.`);
  }
  if (r.jobs_scheduled > 0) {
    const rate = (r.jobs_completed / r.jobs_scheduled) * 100;
    if (rate < 90) flags.push(`Completion rate ${rate.toFixed(0)}% — ${r.jobs_scheduled - r.jobs_completed} scheduled job(s) not completed.`);
  }
  if (r.jobs_failed > 0) flags.push(`${r.jobs_failed} job(s) failed or cancelled in the period.`);
  const { rows: overdue } = await c.query(
    `select count(*)::int n, coalesce(sum(balance),0)::float8 amt from invoice_ar
      where tenant_id = $1 and balance > 0 and days_overdue > 0`, [tenantId]);
  if (overdue[0].n > 0) flags.push(`${overdue[0].n} invoice(s) past due totalling ${aed(Number(overdue[0].amt))} (position today, not period-bound).`);
  const { rows: expiring } = await c.query(
    `select count(*)::int n from contracts
      where tenant_id=$1 and lifecycle_status='active' and end_date is not null
        and end_date <= current_date + 90`, [tenantId]);
  if (expiring[0].n > 0) flags.push(`${expiring[0].n} active contract(s) expire within 90 days — renewal conversations due.`);
  if (r.exceptions.held_for_review > 0) flags.push(`${r.exceptions.held_for_review} field event(s) held for review.`);
  if (r.exceptions.bounced_emails > 0) flags.push(`${r.exceptions.bounced_emails} customer email(s) bounced in the period — fix the addresses.`);
  return flags;
}

export function periodReportEmail(p: PeriodReport, analysis: string[]): { subject: string; text: string; html: string } {
  const { range: g, current: r, previous: prev } = p;
  const subject = `${TITLES[g.period]} — ${g.label}`;
  const rows = [
    { label: "Period", value: g.from === g.to ? g.from : `${g.from} to ${g.to}` },
    { label: "Jobs", value: `${r.jobs_completed} completed of ${r.jobs_scheduled} scheduled${r.jobs_failed ? ` · ${r.jobs_failed} failed` : ""}` },
    { label: "Revenue invoiced", value: `${aed(r.revenue_invoiced)} (previous ${aed(prev.revenue_invoiced)})` },
    { label: "Cash collected", value: `${aed(r.cash_collected)} (previous ${aed(prev.cash_collected)})` },
    { label: "Expenses", value: `${aed(r.expenses)} (previous ${aed(prev.expenses)})` },
    ...(r.stock_consumed_lines.length
      ? [{ label: "Stock consumed", value: r.stock_consumed_lines.slice(0, 5).map((s) => `${s.item} ${s.qty}${s.unit ? " " + s.unit : ""}`).join(" · ") }]
      : []),
    { label: "Exceptions", value: `${r.exceptions.held_for_review} held for review · ${r.exceptions.failed_jobs} failed jobs · ${r.exceptions.bounced_emails} bounced emails` },
  ];
  const text =
`${TITLES[g.period]} — ${g.label}
Period: ${g.from} to ${g.to}

Jobs: ${r.jobs_completed}/${r.jobs_scheduled} completed${r.jobs_failed ? `, ${r.jobs_failed} failed` : ""}
Revenue invoiced: ${aed(r.revenue_invoiced)} (previous period ${aed(prev.revenue_invoiced)})
Cash collected: ${aed(r.cash_collected)} (previous period ${aed(prev.cash_collected)})
Expenses: ${aed(r.expenses)} (previous period ${aed(prev.expenses)})

Analysis:
${analysis.map((a) => `- ${a}`).join("\n")}

Every figure is a deterministic aggregate over the ledger and job records. The attached workbook holds the raw rows behind each one.`;
  const html = renderEmailHtml({
    serviceLineCode: null,
    title: `${TITLES[g.period]} — ${g.label}`,
    paragraphs: [
      `This covers ${g.from} to ${g.to}, compared with the previous period. Every figure is computed directly from the ledger and job records — nothing estimated.`,
      ...analysis,
    ],
    card: { heading: "The period at a glance", rows },
    footnote: "The attached workbook holds every row behind these figures. Drill-downs: Reports in the console.",
  });
  return { subject, text, html };
}

// Queue the weekly and yearly packs. Weekly fires on Monday from 07:00 Dubai
// for the week just ended; yearly on 1 January from 07:00 for the year just
// ended. Idempotent per tenant+period via the subject, exactly like the daily.
export async function queuePeriodReports(c: PoolClient): Promise<number> {
  const { rows: due } = await c.query(
    `select t.id as tenant_id,
            (now() at time zone 'Asia/Dubai')::date::text as today,
            extract(isodow from (now() at time zone 'Asia/Dubai'))::int as dow,
            extract(hour   from (now() at time zone 'Asia/Dubai'))::int as hour,
            (select value #>> '{}' from settings s where s.tenant_id = t.id and s.key = 'reports.daily_recipient' limit 1) as rcpt
       from tenants t`);
  let queued = 0;
  for (const t of due) {
    if (!t.rcpt || t.hour < 7) continue;
    const cadences: Period[] = [];
    if (t.dow === 1) cadences.push("weekly");
    if (t.today.slice(5) === "01-01") cadences.push("yearly");
    for (const period of cadences) {
      const range = previousPeriod(period, t.today);
      const subject = `${TITLES[period]} — ${range.label}`;
      const { rows: dup } = await c.query(
        `select 1 from outbound_notifications where tenant_id=$1 and kind='daily_report' and subject=$2`,
        [t.tenant_id, subject]);
      if (dup.length) continue;
      const p = await computePeriodReport(c, t.tenant_id, range);
      const mail = periodReportEmail(p, await computePeriodAnalysis(c, t.tenant_id, p));
      await c.query(
        `insert into outbound_notifications (tenant_id, kind, to_email, subject, body_text, body_html, status)
         values ($1,'daily_report',$2,$3,$4,$5,'queued')`,
        [t.tenant_id, t.rcpt, mail.subject, mail.text, mail.html]);
      queued++;
    }
  }
  return queued;
}
