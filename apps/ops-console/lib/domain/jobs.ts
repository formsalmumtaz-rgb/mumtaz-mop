import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

export const JOB_STATUSES = ["scheduled", "assigned", "en_route", "arrived", "in_progress", "completed", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobRow {
  customer_code: string | null;
  id: string;
  scheduled_date: string | null;
  scheduled_start: string | null;      // HH:MM (nullable)
  est_duration_minutes: number | null;
  status: string;
  customer: string | null;
  branch: string | null;
  service_line: string | null;
  job_type: string | null;
  team: string | null;
  technicians: string | null;          // comma-joined assigned technician names
  technician_ids: string[];            // for conflict detection
  assigned_count: number;
  has_location: boolean;
  is_contract: boolean;
  completed_at: string | null;
}

const SELECT_JOB = `
  select j.id, j.scheduled_date::text as scheduled_date,
         to_char(j.scheduled_start, 'HH24:MI') as scheduled_start, j.est_duration_minutes, j.status,
         cu.trade_name as customer, cu.code as customer_code, b.name as branch, sl.name as service_line,
         jt.name as job_type, tm.name as team,
         (select string_agg(coalesce(t.full_name, t.code), ', ')
            from job_assignments ja join technicians t on t.id = ja.technician_id
           where ja.job_id = j.id) as technicians,
         coalesce((select array_agg(ja.technician_id) from job_assignments ja where ja.job_id = j.id), '{}') as technician_ids,
         (select count(*)::int from job_assignments ja where ja.job_id = j.id) as assigned_count,
         (j.location is not null) as has_location,
         (j.contract_id is not null) as is_contract,
         j.completed_at::text as completed_at
    from jobs j
    left join customers cu on cu.id = j.customer_id
    left join customer_branches b on b.id = j.branch_id
    left join service_lines sl on sl.id = j.service_line_id
    left join job_types jt on jt.id = j.job_type_id
    left join teams tm on tm.id = j.team_id`;

// Paged, filterable job list (customer search, status, date range).
export async function listJobsPaged(
  tenantId: string,
  opts: { q?: string; status?: string; from?: string; to?: string; serviceLineId?: string; unassigned?: boolean; contractId?: string; limit: number; offset: number },
): Promise<{ rows: JobRow[]; total: number }> {
  const where: string[] = ["j.tenant_id = $1"];
  const params: unknown[] = [tenantId];
  const q = (opts.q ?? "").trim();
  // Search the account number as well as the name (§3.2). A job carries no
  // document number of its own — it is referenced by its service report — so the
  // account number is the number to search here.
  if (q) { params.push(`%${q}%`); where.push(`(cu.code ilike $${params.length} or cu.trade_name ilike $${params.length})`); }
  if (opts.contractId) { params.push(opts.contractId); where.push(`j.contract_id = $${params.length}`); }
  if (opts.status && (JOB_STATUSES as readonly string[]).includes(opts.status)) { params.push(opts.status); where.push(`j.status = $${params.length}`); }
  if (opts.from) { params.push(opts.from); where.push(`j.scheduled_date >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); where.push(`j.scheduled_date <= $${params.length}`); }
  if (opts.serviceLineId) { params.push(opts.serviceLineId); where.push(`j.service_line_id = $${params.length}`); }
  if (opts.unassigned) { where.push(`not exists (select 1 from job_assignments ja where ja.job_id = j.id)`); }
  const w = where.join(" and ");
  const { rows: cnt } = await scopedRead(tenantId,
    `select count(*)::int as n from jobs j left join customers cu on cu.id = j.customer_id where ${w}`, params);
  const { rows } = await scopedRead(tenantId,
    `${SELECT_JOB} where ${w}
      order by j.scheduled_date desc nulls last, j.created_at desc
      limit ${opts.limit} offset ${opts.offset}`, params);
  return { rows: rows as JobRow[], total: cnt[0]?.n ?? 0 };
}

export async function getJobStatusCounts(tenantId: string): Promise<Record<string, number>> {
  const { rows } = await scopedRead(tenantId,
    `select status, count(*)::int as n from jobs where tenant_id=$1 group by status`, [tenantId]);
  const out: Record<string, number> = {};
  for (const r of rows as { status: string; n: number }[]) out[r.status] = r.n;
  return out;
}

// Schedule jobs within a date window (optionally scoped to a division / status /
// unassigned), ordered by day then start time for the calendar.
export async function listScheduleJobs(
  tenantId: string, from: string, to: string,
  opts: { serviceLineId?: string; status?: string; unassigned?: boolean } = {},
): Promise<JobRow[]> {
  const where = ["j.tenant_id=$1", "j.scheduled_date is not null", "j.scheduled_date >= $2", "j.scheduled_date <= $3"];
  const params: unknown[] = [tenantId, from, to];
  if (opts.serviceLineId) { params.push(opts.serviceLineId); where.push(`j.service_line_id = $${params.length}`); }
  if (opts.status && (JOB_STATUSES as readonly string[]).includes(opts.status)) { params.push(opts.status); where.push(`j.status = $${params.length}`); }
  if (opts.unassigned) where.push(`not exists (select 1 from job_assignments ja where ja.job_id = j.id)`);
  const { rows } = await scopedRead(tenantId,
    `${SELECT_JOB} where ${where.join(" and ")}
      order by j.scheduled_date, j.scheduled_start nulls last, cu.trade_name`, params);
  return rows as JobRow[];
}

// Flag scheduling conflicts: a technician double-booked across overlapping time
// windows on the same day. Pure, deterministic — returns the set of conflicting
// job ids. Jobs without a start time or duration can't conflict (unslotted).
export function detectConflicts(jobs: JobRow[]): Set<string> {
  const conflicts = new Set<string>();
  const byTech = new Map<string, JobRow[]>();
  for (const j of jobs) {
    if (!j.scheduled_date || !j.scheduled_start || !j.est_duration_minutes) continue;
    for (const tid of j.technician_ids) {
      if (!byTech.has(tid)) byTech.set(tid, []);
      byTech.get(tid)!.push(j);
    }
  }
  const start = (j: JobRow) => {
    const [h, m] = (j.scheduled_start as string).split(":").map(Number);
    return h * 60 + m;
  };
  for (const list of byTech.values()) {
    const sorted = [...list].sort((a, b) => (a.scheduled_date! + a.scheduled_start!).localeCompare(b.scheduled_date! + b.scheduled_start!));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      if (prev.scheduled_date !== cur.scheduled_date) continue;
      if (start(prev) + (prev.est_duration_minutes ?? 0) > start(cur)) {
        conflicts.add(prev.id); conflicts.add(cur.id);
      }
    }
  }
  return conflicts;
}

// Planned contract visits not yet turned into jobs — the forward pipeline.
export interface PlannedVisit {
  id: string; scheduled_date: string; visit_seq: number | null;
  customer: string | null; contract_number: string | null; branch: string | null;
}
export async function listPlannedVisits(tenantId: string, from: string, to: string): Promise<PlannedVisit[]> {
  const { rows } = await scopedRead(tenantId,
    `select cs.id, cs.scheduled_date::text as scheduled_date, cs.visit_seq,
            cu.trade_name as customer, ct.contract_number, b.name as branch
       from contract_schedule cs
       join contracts ct on ct.id = cs.contract_id
       left join customers cu on cu.id = ct.customer_id
       left join customer_branches b on b.id = cs.branch_id
      where cs.tenant_id=$1 and cs.status='planned'
        and cs.scheduled_date >= $2 and cs.scheduled_date <= $3
      order by cs.scheduled_date, cu.trade_name`,
    [tenantId, from, to]);
  return rows as PlannedVisit[];
}

export interface JobInput {
  customer_id: string;
  branch_id?: string | null;
  job_source_id?: string | null;
  service_type_id?: string | null;
  job_type_id?: string | null;
  team_id?: string | null;
  scheduled_date?: string | null;
  lat?: number | null;
  lng?: number | null;
  contract_id?: string | null; // null for ad-hoc jobs
}

const clean = (v?: string | null) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

// Create a job. Ad-hoc jobs pass no contract_id and use the same record, offline
// flow, report, and invoice path as contract jobs.
export async function createJob(
  tenantId: string,
  serviceLineId: string,
  data: JobInput,
): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    const lat = data.lat ?? null;
    const lng = data.lng ?? null;
    const { rows } = await c.query(
      `insert into jobs
         (tenant_id, service_line_id, customer_id, branch_id, contract_id,
          job_source_id, service_type_id, job_type_id, team_id, scheduled_date,
          status, location)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'scheduled',
         case when $11::float8 is null or $12::float8 is null then null
              else ST_SetSRID(ST_MakePoint($11,$12),4326)::geography end)
       returning id`,
      [
        tenantId, serviceLineId, data.customer_id, clean(data.branch_id), clean(data.contract_id),
        clean(data.job_source_id), clean(data.service_type_id), clean(data.job_type_id),
        clean(data.team_id), clean(data.scheduled_date), lng, lat,
      ],
    );
    await audit(c, tenantId, {
      table: "jobs", rowId: rows[0].id, action: "insert",
      newValue: { customer_id: data.customer_id, job_source_id: data.job_source_id, scheduled_date: data.scheduled_date, lat, lng },
      note: "ad-hoc job created in admin console",
    });
    return rows[0].id as string;
  });
}

// ── Job detail + management (office scheduling; always manually editable) ────
export interface JobDetail {
  id: string;
  status: string;
  scheduled_date: string | null;
  scheduled_start: string | null;
  est_duration_minutes: number | null;
  customer: string | null;
  customer_id: string;
  branch: string | null;
  service_line: string | null;
  service_line_id: string;
  service_type: string | null;
  job_type: string | null;
  team_id: string | null;
  team: string | null;
  technician_ids: string[];
  technicians: string | null;
  contract_id: string | null;
  contract_number: string | null;
  lat: number | null;
  lng: number | null;
  instructions: string | null;
}

export async function getJob(tenantId: string, id: string): Promise<JobDetail | null> {
  const { rows } = await scopedRead(tenantId,
    `select j.id, j.status, j.scheduled_date::text as scheduled_date,
            to_char(j.scheduled_start,'HH24:MI') as scheduled_start, j.est_duration_minutes,
            cu.trade_name as customer, j.customer_id, b.name as branch,
            sl.name as service_line, j.service_line_id, st.name as service_type, jt.name as job_type,
            j.team_id, tm.name as team, ct.contract_number, j.contract_id,
            ST_Y(j.location::geometry) as lat, ST_X(j.location::geometry) as lng,
            j.attributes->>'instructions' as instructions,
            coalesce((select array_agg(ja.technician_id) from job_assignments ja where ja.job_id=j.id),'{}') as technician_ids,
            (select string_agg(coalesce(t.full_name,t.code), ', ') from job_assignments ja join technicians t on t.id=ja.technician_id where ja.job_id=j.id) as technicians
       from jobs j
       left join customers cu on cu.id=j.customer_id
       left join customer_branches b on b.id=j.branch_id
       left join service_lines sl on sl.id=j.service_line_id
       left join service_types st on st.id=j.service_type_id
       left join job_types jt on jt.id=j.job_type_id
       left join teams tm on tm.id=j.team_id
       left join contracts ct on ct.id=j.contract_id
      where j.tenant_id=$1 and j.id=$2`,
    [tenantId, id]);
  return (rows[0] as JobDetail) ?? null;
}

// Assign a team + technicians (replaces the assignment set). Moves a 'scheduled'
// job to 'assigned'. Always editable — office can reassign anytime.
export async function assignJob(tenantId: string, id: string, teamId: string | null, technicianIds: string[]): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select status, team_id from jobs where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Job not found");
    await c.query(`update jobs set team_id=$1 where id=$2`, [clean(teamId), id]);
    await c.query(`delete from job_assignments where job_id=$1 and tenant_id=$2`, [id, tenantId]);
    const ids = [...new Set(technicianIds.filter(Boolean))];
    for (const tid of ids) {
      await c.query(`insert into job_assignments (tenant_id, job_id, technician_id, team_id) values ($1,$2,$3,$4)`, [tenantId, id, tid, clean(teamId)]);
    }
    if (before.status === "scheduled" && ids.length > 0) {
      await c.query(`update jobs set status='assigned' where id=$1`, [id]);
    }
    await audit(c, tenantId, { table: "jobs", rowId: id, action: "update", oldValue: { team_id: before.team_id }, newValue: { team_id: teamId, technicians: ids }, note: "job assigned/reassigned" });
  });
}

// Reschedule: set date, optional start time and duration. Never blocks — the
// office overrides any suggestion.
export async function rescheduleJob(tenantId: string, id: string, date: string, startTime: string | null, durationMinutes: string | null): Promise<void> {
  const d = clean(date);
  if (!d) throw new Error("A date is required");
  const dur = (durationMinutes ?? "").trim();
  const durN = dur === "" ? null : Number(dur);
  if (durN !== null && (!Number.isInteger(durN) || durN < 0)) throw new Error("Duration must be a whole number of minutes ≥ 0");
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select scheduled_date::text, to_char(scheduled_start,'HH24:MI') as st, est_duration_minutes from jobs where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Job not found");
    await c.query(`update jobs set scheduled_date=$1::date, scheduled_start=$2::time, est_duration_minutes=$3 where id=$4`,
      [d, clean(startTime), durN, id]);
    // A moved visit is news the customer needs. The event is emitted only when
    // the DAY actually changed (retiming inside the same day is internal), and
    // only for work still ahead — the consumer decides whether a contactable
    // recipient exists. Never blocks the reschedule.
    if (before.scheduled_date !== d && d >= new Date().toISOString().slice(0, 10)) {
      await c.query(
        `insert into outbox_events (tenant_id, event_type, aggregate_type, entity_id, payload)
         values ($1, 'job.rescheduled', 'job', $2, $3)`,
        [tenantId, id, JSON.stringify({ job_id: id, from_date: before.scheduled_date, to_date: d, start_time: clean(startTime) })]);
    }
    await audit(c, tenantId, { table: "jobs", rowId: id, action: "update", oldValue: before, newValue: { scheduled_date: d, scheduled_start: startTime, est_duration_minutes: durN }, note: "job rescheduled" });
  });
}

// Calendar drag-and-drop: move a job to another DAY, keeping whatever start
// time and duration it already has. Separate from rescheduleJob because that
// function takes an explicit (possibly null) time — passing nothing there would
// silently CLEAR the slot, which a drag across days must never do.
export async function moveJobToDate(tenantId: string, id: string, date: string): Promise<void> {
  const d = clean(date);
  if (!d) throw new Error("A date is required");
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(
      `select scheduled_date::text, to_char(scheduled_start,'HH24:MI') as st, status
         from jobs where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Job not found");
    if (["completed", "cancelled"].includes(before.status)) {
      throw new Error(`Cannot move a job that is ${before.status}`);
    }
    if (before.scheduled_date === d) return; // no-op drop onto the same day
    await c.query(`update jobs set scheduled_date=$1::date where id=$2`, [d, id]);
    if (d >= new Date().toISOString().slice(0, 10)) {
      await c.query(
        `insert into outbox_events (tenant_id, event_type, aggregate_type, entity_id, payload)
         values ($1, 'job.rescheduled', 'job', $2, $3)`,
        [tenantId, id, JSON.stringify({ job_id: id, from_date: before.scheduled_date, to_date: d, start_time: before.st })]);
    }
    await audit(c, tenantId, {
      table: "jobs", rowId: id, action: "update",
      oldValue: { scheduled_date: before.scheduled_date }, newValue: { scheduled_date: d },
      note: "job moved on the calendar (drag and drop)",
    });
  });
}

// Office status changes: cancel a job, or reopen a cancelled one. Completion
// stays technician-driven (never fabricated from the office).
export async function setJobStatus(tenantId: string, id: string, status: string): Promise<void> {
  if (!["cancelled", "scheduled", "assigned"].includes(status)) throw new Error("Unsupported office status change");
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select status from jobs where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Job not found");
    if (["completed", "in_progress", "en_route", "arrived"].includes(before.status) && status === "cancelled") {
      throw new Error(`Cannot cancel a job that is ${before.status}`);
    }
    await c.query(`update jobs set status=$1 where id=$2`, [status, id]);
    await audit(c, tenantId, { table: "jobs", rowId: id, action: "update", oldValue: { status: before.status }, newValue: { status }, note: `job status set to ${status}` });
  });
}
