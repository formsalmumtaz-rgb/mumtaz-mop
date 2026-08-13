import "server-only";
import { scopedRead } from "../rls";

export interface Dashboard {
  jobsToday: number;
  completedToday: number;
  completedTotal: number;
  scheduled: number;
  activeContracts: number;
  revenueQueued: number; // sum of queued/issued invoice totals
  outstanding: number; // unpaid invoice totals
  upcomingWeek: number; // jobs scheduled in the next 7 days
  pendingExpenses: number; // expense claims awaiting approval
  pendingExpenseAmount: number;
  reportsPending: number; // service reports with no review yet
  fieldReviewHeld: number; // field events from a revoked login, held for admin review (T1)
  currency: string;
}

// Live figures for the dashboard. Job + contract + service-report counts are
// scoped to the ACTIVE division (so switching division changes the numbers);
// finance figures (revenue/outstanding/pending expenses) are company-wide, since
// money is tracked across divisions.
export async function getDashboard(tenantId: string, serviceLineId: string): Promise<Dashboard> {
  const { rows } = await scopedRead(tenantId,
    `select
       (select count(*) from jobs where tenant_id=$1 and service_line_id=$2 and scheduled_date = current_date)::int as jobs_today,
       (select count(*) from jobs where tenant_id=$1 and service_line_id=$2 and status='completed' and completed_at::date = current_date)::int as completed_today,
       (select count(*) from jobs where tenant_id=$1 and service_line_id=$2 and status='completed')::int as completed_total,
       (select count(*) from jobs where tenant_id=$1 and service_line_id=$2 and status='scheduled')::int as scheduled,
       (select count(*) from contracts where tenant_id=$1 and service_line_id=$2 and lifecycle_status='active')::int as active_contracts,
       (select coalesce(sum(total),0) from invoices where tenant_id=$1 and status in ('queued','issued'))::float8 as revenue_queued,
       (select coalesce(sum(total),0) from invoices where tenant_id=$1 and status <> 'paid')::float8 as outstanding,
       (select count(*) from jobs where tenant_id=$1 and service_line_id=$2 and scheduled_date > current_date
          and scheduled_date <= current_date + 7 and status not in ('completed','cancelled','failed'))::int as upcoming_week,
       (select count(*) from expenses where tenant_id=$1 and status='submitted')::int as pending_expenses,
       (select coalesce(sum(amount),0) from expenses where tenant_id=$1 and status='submitted')::float8 as pending_expense_amount,
       (select count(*) from service_reports sr where sr.tenant_id=$1 and sr.service_line_id=$2
          and not exists (select 1 from service_report_reviews rv where rv.service_report_id=sr.id))::int as reports_pending,
       (select count(*) from outbox_events where tenant_id=$1 and needs_review and processed_at is null)::int as field_review_held`,
    [tenantId, serviceLineId],
  );
  const r = rows[0];
  return {
    jobsToday: r.jobs_today,
    completedToday: r.completed_today,
    completedTotal: r.completed_total,
    scheduled: r.scheduled,
    activeContracts: r.active_contracts,
    revenueQueued: r.revenue_queued,
    outstanding: r.outstanding,
    upcomingWeek: r.upcoming_week,
    pendingExpenses: r.pending_expenses,
    pendingExpenseAmount: r.pending_expense_amount,
    reportsPending: r.reports_pending,
    fieldReviewHeld: r.field_review_held,
    currency: "AED",
  };
}

// Release 1 item 7 — the ASSUMED-values backlog lived on an orphan landing page
// (`/`, not in the nav). Surfaced here instead so the daily screen carries it.
export async function getAssumedBacklog(tenantId: string): Promise<{ total: number; tables: { tbl: string; n: number }[] }> {
  const tables = ["technicians", "teams", "service_types", "pest_types", "treatment_methods", "frequencies", "facility_types", "pricing_models"];
  const parts = tables.map((t) => `select '${t}' as tbl, count(*) filter (where is_assumed)::int as n from ${t} where tenant_id = $1`);
  const { rows } = await scopedRead(tenantId, parts.join("\nunion all\n"), [tenantId]);
  const list = rows as { tbl: string; n: number }[];
  return { total: list.reduce((s, r) => s + r.n, 0), tables: list.filter((r) => r.n > 0) };
}

// Expiry + email data-quality attention (mig 068).
export async function getExpiryAttention(tenantId: string): Promise<{ expiring: number; nearest: string | null; bounced: number }> {
  const { rows: e } = await scopedRead(tenantId,
    `select count(*)::int as n, min(expiry_date)::text as nearest
       from expiring_documents where tenant_id = $1 and expiry_date <= current_date + 90`, [tenantId]);
  const { rows: b } = await scopedRead(tenantId,
    `select count(*)::int as n from customers where tenant_id = $1 and email_bounced_at is not null and archived_at is null`, [tenantId]);
  return { expiring: e[0]?.n ?? 0, nearest: e[0]?.nearest ?? null, bounced: b[0]?.n ?? 0 };
}

// Attestation overdue + active severe-infestation episodes (migs 076/077).
export async function getComplianceAttention(tenantId: string): Promise<{ attestationOverdue: number; severeActive: number }> {
  const { rows: a } = await scopedRead(tenantId,
    `select count(*)::int as n from contract_attestation_alerts where tenant_id=$1 and is_overdue`, [tenantId]);
  const { rows: s } = await scopedRead(tenantId,
    `select count(*)::int as n from severe_infestation_episodes where tenant_id=$1 and resolved_at is null`, [tenantId]);
  return { attestationOverdue: a[0]?.n ?? 0, severeActive: s[0]?.n ?? 0 };
}
