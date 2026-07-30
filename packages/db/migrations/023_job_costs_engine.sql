-- 023_job_costs_engine.sql
-- Tier 1 · Item 2 (job costing) — the cost engine (compute + gate + retroactivity).
--
-- job_costs is the frozen, append-only per-job cost snapshot. Absorption is at
-- STANDARD rates (labour AED/hr × hours; vehicle AED/km × km; overhead AED/hr ×
-- hours when enabled); material is the actual consumption valuation (016). Each
-- costing run appends a row; the latest per job is current (job_cost_current),
-- so a job first costed ESTIMATED can be recosted ACTUAL later without editing
-- the frozen row (supersedes link). This is what makes retroactive costing work:
-- fn_cost_jobs_backlog costs every completed job that has no current cost.
--
-- HARD CONFIG GATE (owner requirement): fn_cost_job refuses to produce a row
-- while labour/vehicle/overhead rates or the consumed GL account codes are still
-- ASSUMED/zero — no half-real margin figures. Callers get a not_configured status
-- with the list of what to confirm.
--
-- Confidence: cost_confidence = 'estimated' when labour fell back to job duration
-- (no per-tech entry) or distance was derived from time (no job_distance row);
-- fuel_estimated flags that the ACTUAL cost/km basis is missing (variance side) —
-- recorded but, since absorbed vehicle cost uses the STANDARD rate, it does not by
-- itself make the absorbed figure estimated.
--
-- GL absorption + variance POSTING is deferred to 024 (accounts seeded here +
-- 019/022). Additive; job_costs append-only; RLS isolated; no invariant relaxed.

create table job_costs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  service_line_id     uuid references service_lines(id),
  job_id              uuid not null references jobs(id),
  run_seq             bigint generated always as identity,   -- monotonic; breaks computed_at ties for "current"
  computed_at         timestamptz not null default now(),
  material_cost       numeric not null default 0 check (material_cost >= 0),   -- actual (016 valuation)
  labour_cost         numeric not null default 0 check (labour_cost >= 0),      -- standard rate × hours
  vehicle_cost        numeric not null default 0 check (vehicle_cost >= 0),     -- standard rate × km
  overhead_cost       numeric not null default 0 check (overhead_cost >= 0),    -- standard OH × hours (0 if off)
  total_cost numeric generated always as (material_cost + labour_cost + vehicle_cost + overhead_cost) stored,
  revenue             numeric,                                                   -- per-visit invoice; null otherwise
  gross_profit numeric generated always as (revenue - (material_cost + labour_cost + vehicle_cost + overhead_cost)) stored,
  cost_confidence     text not null check (cost_confidence in ('actual','estimated')),
  labour_estimated    boolean not null default false,
  distance_estimated  boolean not null default false,
  fuel_estimated      boolean not null default false,
  overhead_included   boolean not null default false,
  labour_minutes      numeric not null default 0,
  distance_km         numeric,
  standard_labour_rate numeric,
  standard_vehicle_rate numeric,
  overhead_rate       numeric,
  basis               jsonb not null default '{}'::jsonb,
  supersedes          uuid references job_costs(id),
  created_at          timestamptz not null default now(), created_by uuid
);
create index job_costs_job_idx on job_costs (job_id, computed_at desc);
create trigger job_costs_append_only before update or delete on job_costs
  for each row execute function enforce_append_only();
alter table job_costs enable row level security;
create policy tenant_isolation on job_costs
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on job_costs to mop_app;

-- Latest cost per job (run_seq is monotonic, so this is deterministic even for
-- multiple recostings within one transaction).
create view job_cost_current with (security_invoker = true) as
select distinct on (job_id) *
  from job_costs
 order by job_id, run_seq desc;
grant select on job_cost_current to mop_app;

-- KPI: revenue, material, labour, vehicle, overhead, gross profit + confidence.
create view job_profitability with (security_invoker = true) as
select
  jc.tenant_id, jc.job_id, j.customer_id, cu.trade_name as customer,
  j.scheduled_date, j.completed_at,
  jc.revenue, jc.material_cost, jc.labour_cost, jc.vehicle_cost, jc.overhead_cost,
  jc.total_cost, jc.gross_profit,
  jc.cost_confidence, jc.labour_estimated, jc.distance_estimated, jc.fuel_estimated, jc.overhead_included,
  jc.computed_at
from job_cost_current jc
join jobs j on j.id = jc.job_id
left join customers cu on cu.id = j.customer_id;
grant select on job_profitability to mop_app;

-- ── Config-readiness gate ──────────────────────────────────────────────
-- Returns {ready, unconfirmed, items[]}. NOT ready while any consumed rate or GL
-- account code is still ASSUMED/zero. This is what blocks computation.
create or replace function fn_cost_config_status(p_tenant uuid, p_service_line uuid)
returns jsonb language plpgsql stable as $$
declare items text[] := '{}'; v_oh_on boolean;
begin
  if not exists (select 1 from settings where tenant_id=p_tenant and key='cost.standard_labour_rate_hourly'
                   and not is_assumed and (value #>> '{}')::numeric > 0) then
    items := array_append(items, 'standard labour rate');
  end if;
  if not exists (select 1 from settings where tenant_id=p_tenant and key='cost.standard_vehicle_rate_per_km'
                   and not is_assumed and (value #>> '{}')::numeric > 0) then
    items := array_append(items, 'standard vehicle rate');
  end if;
  select coalesce((select (value #>> '{}')::boolean from settings where tenant_id=p_tenant and key='cost.overhead_enabled' limit 1), false)
    into v_oh_on;
  if v_oh_on and not exists (select 1 from settings where tenant_id=p_tenant and key='cost.overhead_rate_per_labour_hour'
                   and not is_assumed and (value #>> '{}')::numeric > 0) then
    items := array_append(items, 'overhead rate');
  end if;
  if exists (select 1 from accounts where tenant_id=p_tenant
               and code in ('5200','5210','2290','5300','5310','2390') and is_assumed) then
    items := array_append(items, 'GL account codes (labour, vehicle)');
  end if;
  if v_oh_on and exists (select 1 from accounts where tenant_id=p_tenant and code in ('5400','5410','2490') and is_assumed) then
    items := array_append(items, 'GL account codes (overhead)');
  end if;
  return jsonb_build_object('ready', array_length(items,1) is null,
                            'unconfirmed', coalesce(array_length(items,1),0),
                            'items', to_jsonb(items));
end $$;

-- ── The engine: cost one completed job (gated; append-only; supersedes prior) ──
create or replace function fn_cost_job(p_job uuid)
returns jsonb language plpgsql as $$
declare
  j record; v_status jsonb;
  v_lab_rate numeric; v_veh_rate numeric; v_oh_on boolean; v_oh_rate numeric; v_kmph numeric;
  v_dur_min numeric; v_hours numeric := 0; v_lab_est boolean := false;
  r record; v_min numeric;
  v_distance numeric; v_dist_est boolean := false; v_fuel_est boolean;
  v_material numeric; v_revenue numeric; v_lab_cost numeric; v_veh_cost numeric; v_oh_cost numeric;
  v_conf text; v_prior uuid; v_new uuid;
begin
  select id, tenant_id, service_line_id, status, device_started_at, device_completed_at, started_at, completed_at
    into j from jobs where id = p_job;
  if not found then return jsonb_build_object('status','skipped','reason','job not found'); end if;
  if j.status <> 'completed' then return jsonb_build_object('status','skipped','reason','job not completed'); end if;

  v_status := fn_cost_config_status(j.tenant_id, j.service_line_id);
  if not (v_status->>'ready')::boolean then
    return jsonb_build_object('status','not_configured','unconfirmed',v_status->'items');
  end if;

  -- scalar-subquery + coalesce so a MISSING setting row yields the default
  -- (a plain `select coalesce(...) into` returns no row and leaves the var null)
  v_lab_rate := coalesce((select (value #>> '{}')::numeric from settings where tenant_id=j.tenant_id and key='cost.standard_labour_rate_hourly' and (service_line_id=j.service_line_id or service_line_id is null) order by service_line_id nulls last limit 1), 0);
  v_veh_rate := coalesce((select (value #>> '{}')::numeric from settings where tenant_id=j.tenant_id and key='cost.standard_vehicle_rate_per_km' and (service_line_id=j.service_line_id or service_line_id is null) order by service_line_id nulls last limit 1), 0);
  v_oh_on    := coalesce((select (value #>> '{}')::boolean from settings where tenant_id=j.tenant_id and key='cost.overhead_enabled' and (service_line_id=j.service_line_id or service_line_id is null) order by service_line_id nulls last limit 1), false);
  v_oh_rate  := coalesce((select (value #>> '{}')::numeric from settings where tenant_id=j.tenant_id and key='cost.overhead_rate_per_labour_hour' and (service_line_id=j.service_line_id or service_line_id is null) order by service_line_id nulls last limit 1), 0);
  v_kmph     := coalesce((select (value #>> '{}')::numeric from settings where tenant_id=j.tenant_id and key='cost.avg_km_per_hour' and (service_line_id=j.service_line_id or service_line_id is null) order by service_line_id nulls last limit 1), 20);

  v_dur_min := coalesce(
    extract(epoch from (j.device_completed_at - j.device_started_at))/60,
    extract(epoch from (j.completed_at - j.started_at))/60, 0);

  -- labour: actual performers (job_assignments); per-tech entry, else job duration
  for r in select ja.technician_id from job_assignments ja where ja.job_id = p_job loop
    select coalesce(le.minutes, extract(epoch from (le.time_out - le.time_in))/60)
      into v_min from job_labour_entries le where le.job_id = p_job and le.technician_id = r.technician_id;
    if v_min is null then v_min := v_dur_min; v_lab_est := true; end if;
    v_hours := v_hours + coalesce(v_min,0)/60.0;
  end loop;
  if not exists (select 1 from job_assignments where job_id = p_job) then v_lab_est := true; end if;
  v_lab_cost := round(coalesce(v_lab_rate,0) * v_hours, 2);

  -- distance / vehicle: job_distance primary; else derive from time (flag estimated)
  select distance_km into v_distance from job_distance where job_id = p_job;
  if v_distance is null then v_distance := round(v_hours * v_kmph, 2); v_dist_est := true; end if;
  v_veh_cost := round(coalesce(v_veh_rate,0) * v_distance, 2);
  v_fuel_est := not exists (
    select 1 from job_assignments ja
      join vehicles ve on ve.technician_id = ja.technician_id
      join vehicle_cost_per_km cpk on cpk.vehicle_id = ve.id
     where ja.job_id = p_job and cpk.cost_per_km is not null);

  if v_oh_on then v_oh_cost := round(coalesce(v_oh_rate,0) * v_hours, 2); else v_oh_cost := 0; end if;

  -- material: actual consumption valuation for the job (016 stock_valuation entries)
  select coalesce(sum(jl.debit),0) into v_material
    from journal_entries je
    join journal_lines jl on jl.journal_entry_id = je.id and jl.debit > 0
    join stock_movements m on m.id = je.source_id
   where je.tenant_id = j.tenant_id and je.source_type = 'stock_valuation' and m.job_id = p_job;

  -- revenue: per-visit invoice(s) on the job
  select sum(total) into v_revenue from invoices where job_id = p_job and status in ('queued','issued','paid');

  v_conf := case when v_lab_est or v_dist_est then 'estimated' else 'actual' end;
  select id into v_prior from job_cost_current where job_id = p_job;

  insert into job_costs(tenant_id, service_line_id, job_id, material_cost, labour_cost, vehicle_cost, overhead_cost,
      revenue, cost_confidence, labour_estimated, distance_estimated, fuel_estimated, overhead_included,
      labour_minutes, distance_km, standard_labour_rate, standard_vehicle_rate, overhead_rate, basis, supersedes)
    values (j.tenant_id, j.service_line_id, p_job, v_material, v_lab_cost, v_veh_cost, v_oh_cost,
      v_revenue, v_conf, v_lab_est, v_dist_est, v_fuel_est, v_oh_on,
      round(v_hours*60,1), v_distance, v_lab_rate, v_veh_rate, case when v_oh_on then v_oh_rate else null end,
      jsonb_build_object('labour_hours', v_hours, 'duration_min', v_dur_min), v_prior)
    returning id into v_new;

  return jsonb_build_object('status','costed','job_cost_id',v_new,'confidence',v_conf,
    'material',v_material,'labour',v_lab_cost,'vehicle',v_veh_cost,'overhead',v_oh_cost,'revenue',v_revenue,
    'total', v_material+v_lab_cost+v_veh_cost+v_oh_cost);
end $$;

-- Retroactive backfill: cost every completed job with no current cost.
create or replace function fn_cost_jobs_backlog(p_tenant uuid, p_limit int default 500)
returns jsonb language plpgsql as $$
declare r record; v_costed int := 0; v_blocked int := 0; v_res jsonb;
begin
  for r in select j.id from jobs j
             where j.tenant_id = p_tenant and j.status = 'completed'
               and not exists (select 1 from job_cost_current jc where jc.job_id = j.id)
             limit p_limit loop
    v_res := fn_cost_job(r.id);
    if v_res->>'status' = 'costed' then v_costed := v_costed + 1;
    elsif v_res->>'status' = 'not_configured' then v_blocked := v_blocked + 1; end if;
  end loop;
  return jsonb_build_object('costed', v_costed, 'blocked', v_blocked);
end $$;

-- Utilisation / labour variance for a period (absorbed at standard vs actual
-- capacity). Basis for the utilisation KPI. GL posting of variance lands in 024.
create or replace function fn_cost_variance(p_tenant uuid, p_from date, p_to date)
returns jsonb language plpgsql stable as $$
declare v_absorbed numeric; v_absorbed_hours numeric; v_actual numeric; v_available_hours numeric; v_months numeric;
begin
  v_months := greatest((p_to - p_from)::numeric / 30.0, 0.0001);
  select coalesce(sum(jc.labour_cost),0), coalesce(sum(jc.labour_minutes)/60.0,0)
    into v_absorbed, v_absorbed_hours
    from job_cost_current jc join jobs j on j.id = jc.job_id
   where jc.tenant_id = p_tenant and j.completed_at >= p_from and j.completed_at < p_to;
  select coalesce(sum(ec.monthly_employment_cost),0) * v_months,
         coalesce(sum(ec.productive_hours_month),0) * v_months
    into v_actual, v_available_hours
    from employee_cost_components ec
   where ec.tenant_id = p_tenant and ec.effective_to is null;   -- current cost version per tech
  return jsonb_build_object(
    'absorbed_labour', round(v_absorbed,2),
    'actual_labour', round(v_actual,2),
    'labour_variance', round(v_actual - v_absorbed,2),
    'absorbed_hours', round(v_absorbed_hours,1),
    'available_hours', round(v_available_hours,1),
    'utilisation_pct', case when v_available_hours > 0 then round(100.0 * v_absorbed_hours / v_available_hours, 1) else null end);
end $$;

-- ── Overhead accounts + fallback setting (ASSUMED; GL posting in 024) ──
do $$
declare v_tenant uuid; v_sl uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  if v_tenant is null then return; end if;
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';
  insert into accounts(tenant_id, code, name, account_type, is_assumed, assumed_note) values
    (v_tenant, '5400', 'Overhead Absorbed',           'expense',   true, 'ASSUMED GL code — confirm'),
    (v_tenant, '5410', 'Overhead Variance',           'expense',   true, 'ASSUMED GL code — confirm'),
    (v_tenant, '2490', 'Overhead Absorption Clearing', 'liability', true, 'ASSUMED GL code — confirm')
  on conflict (tenant_id, code) do nothing;
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, v_sl,  'cost.avg_km_per_hour', '20'::jsonb, 'Fallback: estimate job distance from labour hours when job_distance is absent', true),
    (v_tenant, null,  'cost.account_code.overhead',          '"5400"'::jsonb, 'GL Dr overhead into job cost', true),
    (v_tenant, null,  'cost.account_code.overhead_variance', '"5410"'::jsonb, 'GL overhead variance',         true),
    (v_tenant, null,  'cost.account_code.overhead_clearing', '"2490"'::jsonb, 'GL overhead clearing',         true);
end $$;
