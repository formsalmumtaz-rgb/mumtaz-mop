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
  const mod = await import("exceljs");
  const ExcelJS = (mod as { default?: typeof mod }).default ?? mod;
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
        where j.tenant_id = $1 and (j.scheduled_date = $2::date or coalesce(j.completed_at::date, '1900-01-01') = $2::date)
        order by j.scheduled_start nulls last`, [tenantId, date]),
    c.query(
      `select i.invoice_number, cu.trade_name as customer, i.status,
              i.subtotal::float8 as subtotal, i.vat_total::float8 as vat, i.total::float8 as total
         from invoices i join customers cu on cu.id = i.customer_id
        where i.tenant_id = $1 and i.created_at::date = $2::date order by i.created_at`, [tenantId, date]),
    c.query(
      `select r.receipt_number, cu.trade_name as customer, r.method, r.amount::float8 as amount
         from receipts r left join customers cu on cu.id = r.customer_id
        where r.tenant_id = $1 and r.receipt_date = $2::date order by r.created_at`, [tenantId, date]),
    c.query(
      `select e.expense_date::text as date, coalesce(t.full_name, t.code) as technician,
              e.amount::float8 as amount, e.description, e.status
         from expenses e left join technicians t on t.id = e.technician_id
        where e.tenant_id = $1 and e.expense_date = $2::date order by e.created_at`, [tenantId, date]),
    c.query(
      `select it.name as item, sm.movement_type, sm.quantity::float8 as qty, u.code as unit,
              cu.trade_name as job_customer
         from stock_movements sm
         join items it on it.id = sm.item_id
         left join units u on u.id = sm.unit_id
         left join jobs j on j.id = sm.job_id
         left join customers cu on cu.id = j.customer_id
        where sm.tenant_id = $1 and sm.created_at::date = $2::date order by sm.created_at`, [tenantId, date]),
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
