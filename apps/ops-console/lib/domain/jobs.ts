import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

export const JOB_STATUSES = ["scheduled", "assigned", "en_route", "arrived", "in_progress", "completed", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobRow {
  id: string;
  scheduled_date: string | null;
  status: string;
  customer: string | null;
  branch: string | null;
  service_line: string | null;
  job_type: string | null;
  team: string | null;
  technicians: string | null;   // comma-joined assigned technician names
  is_contract: boolean;
  completed_at: string | null;
}

const SELECT_JOB = `
  select j.id, j.scheduled_date::text as scheduled_date, j.status,
         cu.trade_name as customer, b.name as branch, sl.name as service_line,
         jt.name as job_type, tm.name as team,
         (select string_agg(coalesce(t.full_name, t.code), ', ')
            from job_assignments ja join technicians t on t.id = ja.technician_id
           where ja.job_id = j.id) as technicians,
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
  opts: { q?: string; status?: string; from?: string; to?: string; limit: number; offset: number },
): Promise<{ rows: JobRow[]; total: number }> {
  const where: string[] = ["j.tenant_id = $1"];
  const params: unknown[] = [tenantId];
  const q = (opts.q ?? "").trim();
  if (q) { params.push(`%${q}%`); where.push(`cu.trade_name ilike $${params.length}`); }
  if (opts.status && (JOB_STATUSES as readonly string[]).includes(opts.status)) { params.push(opts.status); where.push(`j.status = $${params.length}`); }
  if (opts.from) { params.push(opts.from); where.push(`j.scheduled_date >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); where.push(`j.scheduled_date <= $${params.length}`); }
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

// Schedule agenda: jobs within a date window, ordered for a day-by-day view.
export async function listScheduleJobs(tenantId: string, from: string, to: string): Promise<JobRow[]> {
  const { rows } = await scopedRead(tenantId,
    `${SELECT_JOB}
      where j.tenant_id=$1 and j.scheduled_date is not null
        and j.scheduled_date >= $2 and j.scheduled_date <= $3
      order by j.scheduled_date, cu.trade_name`,
    [tenantId, from, to]);
  return rows as JobRow[];
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
