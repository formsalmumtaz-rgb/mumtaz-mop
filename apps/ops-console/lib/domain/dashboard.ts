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
  currency: string;
}

// Live figures for the owner's dashboard (computed on load; a materialised-view
// refresh for true real-time is a later phase).
export async function getDashboard(tenantId: string): Promise<Dashboard> {
  const { rows } = await scopedRead(tenantId, 
    `select
       (select count(*) from jobs where tenant_id=$1 and scheduled_date = current_date)::int as jobs_today,
       (select count(*) from jobs where tenant_id=$1 and status='completed' and completed_at::date = current_date)::int as completed_today,
       (select count(*) from jobs where tenant_id=$1 and status='completed')::int as completed_total,
       (select count(*) from jobs where tenant_id=$1 and status='scheduled')::int as scheduled,
       (select count(*) from contracts where tenant_id=$1 and lifecycle_status='active')::int as active_contracts,
       (select coalesce(sum(total),0) from invoices where tenant_id=$1 and status in ('queued','issued'))::float8 as revenue_queued,
       (select coalesce(sum(total),0) from invoices where tenant_id=$1 and status <> 'paid')::float8 as outstanding,
       (select count(*) from jobs where tenant_id=$1 and scheduled_date > current_date
          and scheduled_date <= current_date + 7 and status not in ('completed','cancelled','failed'))::int as upcoming_week,
       (select count(*) from expenses where tenant_id=$1 and status='submitted')::int as pending_expenses,
       (select coalesce(sum(amount),0) from expenses where tenant_id=$1 and status='submitted')::float8 as pending_expense_amount,
       (select count(*) from service_reports sr where sr.tenant_id=$1
          and not exists (select 1 from service_report_reviews rv where rv.service_report_id=sr.id))::int as reports_pending`,
    [tenantId],
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
    currency: "AED",
  };
}
