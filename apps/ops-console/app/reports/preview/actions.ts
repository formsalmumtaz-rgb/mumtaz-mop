"use server";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { pool } from "@/lib/db";
import {
  previousPeriod, computePeriodReport, computePeriodAnalysis, periodReportEmail, type Period,
} from "@mop/worker";

// Queue the previewed report for the configured recipient. It is queued, not
// sent inline: the sweep owns delivery (and attaches the workbook), so a
// manually triggered report travels the identical path as a scheduled one.
export async function sendReportNowAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const period = (["daily", "weekly", "monthly", "yearly"] as const)
    .find((p) => p === String(fd.get("period") ?? "")) as Period | undefined;
  if (!period) redirect("/reports/preview?error=Unknown+period");
  const tenantId = await getTenantId();
  const c = await pool.connect();
  try {
    const { rows: nowRows } = await c.query(`select (now() at time zone 'Asia/Dubai')::date::text as today`);
    const range = previousPeriod(period, nowRows[0].today);
    const { rows: rcpt } = await c.query(
      `select value #>> '{}' as email from settings where tenant_id=$1 and key='reports.daily_recipient' limit 1`, [tenantId]);
    if (!rcpt[0]?.email) {
      redirect(`/reports/preview?period=${period}&error=${encodeURIComponent("No report recipient set — add reports.daily_recipient in Settings")}`);
    }
    const report = await computePeriodReport(c, tenantId, range);
    const mail = periodReportEmail(report, await computePeriodAnalysis(c, tenantId, report));
    // Re-sending the same period intentionally makes a NEW row: the subject
    // guard exists to stop the scheduler double-firing, not to stop a person
    // who deliberately asked for it again.
    await c.query(
      `insert into outbound_notifications (tenant_id, kind, to_email, subject, body_text, body_html, status)
       values ($1,'daily_report',$2,$3,$4,$5,'queued')`,
      [tenantId, rcpt[0].email, mail.subject, mail.text, mail.html]);
  } finally {
    c.release();
  }
  redirect(`/reports/preview?period=${period}&sent=1`);
}
