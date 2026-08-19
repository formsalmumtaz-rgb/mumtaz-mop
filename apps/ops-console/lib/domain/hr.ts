import "server-only";
import type { PoolClient } from "pg";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// §3.10 — the office side of the requests technicians raise from the app.
export interface HrRequestRow {
  id: string; technician_id: string; technician: string | null;
  kind: string; status: string; from_date: string | null; to_date: string | null;
  reason: string; decision_note: string | null; decided_at: string | null;
  created_at: string; days: number | null;
}

export async function listHrRequests(tenantId: string, status?: string): Promise<HrRequestRow[]> {
  const { rows } = await scopedRead(tenantId,
    `select r.id, r.technician_id, t.full_name as technician, r.kind, r.status,
            r.from_date::text, r.to_date::text, r.reason, r.decision_note,
            r.decided_at::text, r.created_at::text,
            case when r.from_date is not null and r.to_date is not null
                 then (r.to_date - r.from_date) + 1 end as days
       from hr_requests r
       left join technicians t on t.id = r.technician_id
      where r.tenant_id = $1 and ($2::text is null or r.status = $2)
      order by case r.status when 'submitted' then 0 else 1 end, r.created_at desc`,
    [tenantId, status ?? null]);
  return rows as HrRequestRow[];
}

// Approve or decline. The decision and its owner are written together — the
// table refuses a decision with no decider (mig 118), so this cannot half-happen.
export async function decideHrRequest(
  tenantId: string, actorId: string | null, id: string,
  decision: "approved" | "declined", note?: string,
): Promise<void> {
  await withTenantTx(tenantId, async (c: PoolClient) => {
    const { rows } = await c.query(
      `select status, kind, technician_id from hr_requests where tenant_id=$1 and id=$2 for update`,
      [tenantId, id]);
    if (!rows[0]) throw new Error("Request not found");
    if (rows[0].status !== "submitted") throw new Error(`This request is already ${rows[0].status}`);
    await c.query(
      `update hr_requests set status=$3, decided_at=now(), decided_by=coalesce($4::uuid, app_current_actor()),
              decision_note=nullif(btrim($5),'')
        where tenant_id=$1 and id=$2`,
      [tenantId, id, decision, actorId, note ?? null]);
    await audit(c, tenantId, {
      table: "hr_requests", rowId: id, action: "update",
      oldValue: { status: "submitted" }, newValue: { status: decision, note: note ?? null },
      note: `HR request ${decision} by the office`,
    });
  });
}

// Attendance and hours for a period — what payroll is calculated from (§3.10).
// Derived from the technician's own clock, never re-keyed.
export async function attendanceSummary(
  tenantId: string, from: string, to: string,
): Promise<{ technician_id: string; full_name: string; days_present: number; hours: string; days_on_leave: number }[]> {
  const { rows } = await scopedRead(tenantId,
    `select t.id as technician_id, t.full_name,
            count(*) filter (where w.present)::int as days_present,
            coalesce(sum(w.hours), 0)::text as hours,
            (select count(*)::int from hr_requests r
              where r.tenant_id = $1 and r.technician_id = t.id and r.status = 'approved'
                and r.kind like '%leave' and r.from_date <= $3::date and coalesce(r.to_date, r.from_date) >= $2::date
            ) as days_on_leave
       from technicians t
       left join technician_working_hours w
         on w.technician_id = t.id and w.check_date between $2::date and $3::date
      where t.tenant_id = $1 and t.archived_at is null
      group by t.id, t.full_name
      order by t.full_name`, [tenantId, from, to]);
  return rows as never;
}
