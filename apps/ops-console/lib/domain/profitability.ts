import "server-only";
import { scopedRead } from "../rls";

// Read-only profitability reporting over the job_profitability view (mig 023).
// Margin is computed over revenue-bearing jobs; cost totals are over all filtered
// jobs (counts surface the gap for fixed-period jobs with no per-visit revenue).

export interface ProfitFilters {
  from?: string;
  to?: string;
  customerId?: string;
  branchId?: string;
  technicianId?: string;
  serviceLineId?: string;
  confidence?: string; // 'all' | 'actual' | 'estimated'
}

function buildWhere(tenantId: string, f: ProfitFilters): { where: string; params: unknown[] } {
  const params: unknown[] = [tenantId];
  const cond: string[] = ["jp.tenant_id = $1"];
  const p = (v: unknown) => {
    params.push(v);
    return "$" + params.length;
  };
  if (f.from) cond.push(`j.completed_at >= ${p(f.from)}`);
  if (f.to) cond.push(`j.completed_at < (${p(f.to)}::date + interval '1 day')`);
  if (f.customerId) cond.push(`jp.customer_id = ${p(f.customerId)}`);
  if (f.branchId) cond.push(`j.branch_id = ${p(f.branchId)}`);
  if (f.serviceLineId) cond.push(`j.service_line_id = ${p(f.serviceLineId)}`);
  if (f.confidence === "actual" || f.confidence === "estimated") cond.push(`jp.cost_confidence = ${p(f.confidence)}`);
  if (f.technicianId)
    cond.push(`exists (select 1 from job_assignments ja where ja.job_id = jp.job_id and ja.technician_id = ${p(f.technicianId)})`);
  return { where: cond.join(" and "), params };
}

export interface ProfitSummary {
  jobs: number;
  revenue_jobs: number;
  estimated_jobs: number;
  actual_jobs: number;
  revenue: number;
  material: number;
  labour: number;
  vehicle: number;
  overhead: number;
  total_cost: number;
  gross_profit: number; // over revenue-bearing jobs
  gross_margin_pct: number | null;
}

export async function getProfitSummary(tenantId: string, f: ProfitFilters): Promise<ProfitSummary> {
  const { where, params } = buildWhere(tenantId, f);
  const { rows } = await scopedRead(tenantId, 
    `select
       count(*)::int as jobs,
       count(*) filter (where jp.revenue is not null)::int as revenue_jobs,
       count(*) filter (where jp.cost_confidence='estimated')::int as estimated_jobs,
       count(*) filter (where jp.cost_confidence='actual')::int as actual_jobs,
       coalesce(sum(jp.revenue),0)::float8 as revenue,
       coalesce(sum(jp.material_cost),0)::float8 as material,
       coalesce(sum(jp.labour_cost),0)::float8 as labour,
       coalesce(sum(jp.vehicle_cost),0)::float8 as vehicle,
       coalesce(sum(jp.overhead_cost),0)::float8 as overhead,
       coalesce(sum(jp.total_cost),0)::float8 as total_cost,
       coalesce(sum(jp.gross_profit),0)::float8 as gross_profit
     from job_profitability jp join jobs j on j.id = jp.job_id
     where ${where}`,
    params,
  );
  const r = rows[0];
  const gross_margin_pct = r.revenue > 0 ? (r.gross_profit / r.revenue) * 100 : null;
  return { ...r, gross_margin_pct };
}

export interface ProfitRow {
  job_id: string;
  customer: string | null;
  completed_at: string | null;
  revenue: number | null;
  material_cost: number;
  labour_cost: number;
  vehicle_cost: number;
  overhead_cost: number;
  total_cost: number;
  gross_profit: number | null;
  gross_margin_pct: number | null;
  cost_confidence: string;
  labour_estimated: boolean;
  distance_estimated: boolean;
  fuel_estimated: boolean;
}

export async function listProfitRows(tenantId: string, f: ProfitFilters, limit = 200): Promise<ProfitRow[]> {
  const { where, params } = buildWhere(tenantId, f);
  params.push(limit);
  const { rows } = await scopedRead(tenantId, 
    `select jp.job_id, jp.customer, j.completed_at::text as completed_at,
            jp.revenue::float8, jp.material_cost::float8, jp.labour_cost::float8, jp.vehicle_cost::float8,
            jp.overhead_cost::float8, jp.total_cost::float8, jp.gross_profit::float8,
            case when jp.revenue is not null and jp.revenue <> 0 then (jp.gross_profit / jp.revenue) * 100 end::float8 as gross_margin_pct,
            jp.cost_confidence, jp.labour_estimated, jp.distance_estimated, jp.fuel_estimated
       from job_profitability jp join jobs j on j.id = jp.job_id
      where ${where}
      order by j.completed_at desc nulls last
      limit $${params.length}`,
    params,
  );
  return rows as ProfitRow[];
}

export interface FilterOption { id: string; name: string | null }
export interface ProfitFilterOptions {
  customers: FilterOption[];
  branches: FilterOption[];
  technicians: FilterOption[];
  divisions: FilterOption[];
}

export async function listProfitFilterOptions(tenantId: string): Promise<ProfitFilterOptions> {
  const [customers, branches, technicians, divisions] = await Promise.all([
    scopedRead(tenantId, `select id, trade_name as name from customers where tenant_id=$1 order by trade_name`, [tenantId]),
    scopedRead(tenantId, `select id, coalesce(name, code) as name from customer_branches where tenant_id=$1 order by name`, [tenantId]),
    scopedRead(tenantId, `select id, coalesce(full_name, code) as name from technicians where tenant_id=$1 and is_active order by code`, [tenantId]),
    scopedRead(tenantId, `select id, name from service_lines where tenant_id=$1 order by name`, [tenantId]),
  ]);
  return { customers: customers.rows, branches: branches.rows, technicians: technicians.rows, divisions: divisions.rows };
}
