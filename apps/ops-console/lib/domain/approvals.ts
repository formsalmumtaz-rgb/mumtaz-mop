import "server-only";
import type { PoolClient } from "pg";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// §3.4 — the next-day / night-schedule approval queue.
//
// Tonight's and tomorrow's generated schedule is reviewed here before anyone
// outside the office hears about it. Approving is what releases the customer 24h
// notices (services/worker/src/notify.ts): a visit the office has not agreed to
// is never promised to a customer.
//
// Keyed on operating_date so a night visit starting at 23:00 is approved with the
// operating day it belongs to, not the calendar day it happens to start on.
export interface PendingDay {
  operating_date: string;
  shift_id: string | null;
  shift_name: string | null;
  jobs: number;
  unassigned: number;
  areas: string[];
  approved_at: string | null;
  notices_sent: number;
}

export async function listPendingApprovals(tenantId: string, days = 2): Promise<PendingDay[]> {
  const { rows } = await scopedRead(tenantId,
    `select coalesce(j.operating_date, j.scheduled_date)::text as operating_date,
            j.shift_id, sh.name as shift_name,
            count(*)::int as jobs,
            count(*) filter (
              where not exists (select 1 from job_assignments ja where ja.job_id = j.id)
            )::int as unassigned,
            array_remove(array_agg(distinct cu.district), null) as areas,
            (select max(a.approved_at)::text from schedule_approvals a
              where a.tenant_id = j.tenant_id
                and a.operating_date = coalesce(j.operating_date, j.scheduled_date)
                and (a.shift_id is null or a.shift_id = j.shift_id)) as approved_at,
            count(*) filter (
              where exists (select 1 from outbound_notifications n
                             where n.job_id = j.id and n.kind = 'visit_notice_24h')
            )::int as notices_sent
       from jobs j
       join customers cu on cu.id = j.customer_id
       left join shifts sh on sh.id = j.shift_id
      where j.tenant_id = $1 and j.archived_at is null
        and j.status in ('scheduled','assigned')
        and coalesce(j.operating_date, j.scheduled_date)
              between current_date and current_date + ($2::int - 1)
      group by 1, 2, 3, j.tenant_id
      order by 1, 3 nulls first`, [tenantId, days]);
  return rows as PendingDay[];
}

// The jobs making up one pending day, for the review list.
export async function listDayJobs(tenantId: string, operatingDate: string, shiftId: string | null) {
  const { rows } = await scopedRead(tenantId,
    `select j.id, j.scheduled_date::text as date, to_char(j.scheduled_start,'HH24:MI') as start,
            cu.code as account_no, coalesce(cu.trade_name, cu.legal_name) as customer,
            cu.district as area, b.name as site, tm.name as team, j.status,
            j.attributes ? 'off_pattern' as off_pattern,
            exists (select 1 from job_assignments ja where ja.job_id = j.id) as assigned
       from jobs j
       join customers cu on cu.id = j.customer_id
       left join customer_branches b on b.id = j.branch_id
       left join teams tm on tm.id = j.team_id
      where j.tenant_id = $1 and j.archived_at is null
        and coalesce(j.operating_date, j.scheduled_date) = $2::date
        and ($3::uuid is null or j.shift_id = $3::uuid)
        and j.status in ('scheduled','assigned')
      order by j.scheduled_start nulls last, cu.district nulls last, cu.trade_name`,
    [tenantId, operatingDate, shiftId]);
  return rows as {
    id: string; date: string; start: string | null; account_no: string | null; customer: string | null;
    area: string | null; site: string | null; team: string | null; status: string;
    off_pattern: boolean; assigned: boolean;
  }[];
}

// Approve one operating day (optionally one shift of it). This is the act that
// releases the customer notices, so it is audited with the count it approved.
export async function approveSchedule(
  tenantId: string, operatingDate: string, shiftId: string | null, note?: string,
): Promise<{ approved: number }> {
  return withTenantTx(tenantId, async (c: PoolClient) => {
    const { rows: n } = await c.query(
      `select count(*)::int as jobs from jobs j
        where j.tenant_id=$1 and j.archived_at is null
          and coalesce(j.operating_date, j.scheduled_date) = $2::date
          and ($3::uuid is null or j.shift_id = $3::uuid)
          and j.status in ('scheduled','assigned')`, [tenantId, operatingDate, shiftId]);
    // NOT "on conflict": the unique constraint includes shift_id, which is NULL
    // for a whole-day approval, and NULLs never conflict in Postgres — so
    // on-conflict would happily insert a second whole-day approval. The table is
    // append-only, so a duplicate could not then be cleaned up.
    const { rows: dup } = await c.query(
      `select 1 from schedule_approvals
        where tenant_id=$1 and operating_date=$2::date
          and shift_id is not distinct from $3::uuid limit 1`,
      [tenantId, operatingDate, shiftId]);
    if (dup[0]) throw new Error("That day is already approved.");
    const { rows } = await c.query(
      `insert into schedule_approvals (tenant_id, operating_date, shift_id, job_count, note)
       values ($1,$2::date,$3::uuid,$4,$5)
       returning id`, [tenantId, operatingDate, shiftId, n[0].jobs, note ?? null]);
    await audit(c, tenantId, {
      table: "schedule_approvals", rowId: rows[0].id, action: "insert",
      newValue: { operating_date: operatingDate, shift_id: shiftId, job_count: n[0].jobs },
      note: `schedule approved for ${operatingDate}${shiftId ? " (one shift)" : ""} — ${n[0].jobs} job(s); customer 24h notices released`,
    });
    return { approved: n[0].jobs as number };
  });
}
