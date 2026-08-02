-- 029_estimation_engine.sql
-- Tier 2 — Estimation Engine. Pre-sales estimates that connect the Pricing Model
-- Engine (028, revenue via fn_price) with the cost basis (standard rates, via new
-- fn_estimate_cost) to give a deterministic profit preview:
--   Survey → Estimation → Price → Profit Preview → (Quotation → Contract later)
--
-- Additive: two mutable draft tables (RLS-isolated) + a preview view + one STABLE
-- cost function. No job-state flow, technician spine, ledger, or append-only
-- invariant is touched. Depreciation/lease is NOT included (management-only rule);
-- the estimate cost basis is the operational basis: material + labour + vehicle
-- running + optional overhead.

create table estimates (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  customer_id     uuid references customers(id),
  branch_id       uuid references customer_branches(id),
  estimate_number text,
  status          text not null default 'draft' check (status in ('draft','quoted','accepted','rejected','expired')),
  property_type   text check (property_type is null or property_type in ('residential','commercial','industrial')),
  engagement_type text check (engagement_type is null or engagement_type in ('recurring','ad_hoc')),
  valid_until     date,
  notes           text,
  snapshot        jsonb not null default '{}'::jsonb,   -- frozen quote snapshot when status→quoted
  is_assumed      boolean not null default false,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid
);
create index estimates_customer_idx on estimates (customer_id);
create trigger estimates_touch before update on estimates for each row execute function set_updated_at();
alter table estimates enable row level security;
create policy tenant_isolation on estimates using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on estimates to mop_app;

create table estimate_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  estimate_id       uuid not null references estimates(id) on delete cascade,
  service_type_id   uuid references service_types(id),
  pricing_model_id  uuid references pricing_models(id),
  description       text,
  unit_price        numeric not null default 0 check (unit_price >= 0),   -- rate for the model
  measure           numeric not null default 1 check (measure >= 0),      -- for single-measure models
  measures          jsonb not null default '{}'::jsonb,                   -- for formula models
  line_total        numeric not null default 0 check (line_total >= 0),   -- revenue = fn_price(...)
  est_labour_hours  numeric not null default 0 check (est_labour_hours >= 0),
  est_distance_km   numeric not null default 0 check (est_distance_km >= 0),
  est_material_cost numeric not null default 0 check (est_material_cost >= 0),
  est_cost          numeric not null default 0 check (est_cost >= 0),      -- = fn_estimate_cost(...)
  seq               integer,
  created_at        timestamptz not null default now(), created_by uuid,
  updated_at        timestamptz not null default now(), updated_by uuid
);
create index estimate_lines_estimate_idx on estimate_lines (estimate_id);
create trigger estimate_lines_touch before update on estimate_lines for each row execute function set_updated_at();
alter table estimate_lines enable row level security;
create policy tenant_isolation on estimate_lines using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on estimate_lines to mop_app;

-- Deterministic estimate cost basis (operational: material + labour + vehicle +
-- optional overhead, at the tenant's standard rates). STABLE (reads settings).
-- No depreciation/lease — that is management-only and never in an estimate/job.
create or replace function fn_estimate_cost(p_tenant uuid, p_service_line uuid, p_hours numeric, p_km numeric, p_material numeric)
returns numeric language sql stable as $$
  select round(
    coalesce(p_material, 0)
    + coalesce((select (value #>> '{}')::numeric from settings where tenant_id=p_tenant and key='cost.standard_labour_rate_hourly'
                 and (service_line_id=p_service_line or service_line_id is null) order by service_line_id nulls last limit 1), 0) * coalesce(p_hours, 0)
    + coalesce((select (value #>> '{}')::numeric from settings where tenant_id=p_tenant and key='cost.standard_vehicle_rate_per_km'
                 and (service_line_id=p_service_line or service_line_id is null) order by service_line_id nulls last limit 1), 0) * coalesce(p_km, 0)
    + case when coalesce((select (value #>> '{}')::boolean from settings where tenant_id=p_tenant and key='cost.overhead_enabled' limit 1), false)
        then coalesce((select (value #>> '{}')::numeric from settings where tenant_id=p_tenant and key='cost.overhead_rate_per_labour_hour'
                        and (service_line_id=p_service_line or service_line_id is null) order by service_line_id nulls last limit 1), 0) * coalesce(p_hours, 0)
        else 0 end
  , 2);
$$;

-- Per-estimate profit preview (revenue vs estimated operating cost).
create view estimate_profitability with (security_invoker = true) as
select
  e.tenant_id, e.id as estimate_id, e.customer_id, e.status,
  coalesce(sum(l.line_total), 0)                                as revenue,
  coalesce(sum(l.est_cost), 0)                                  as est_cost,
  coalesce(sum(l.line_total), 0) - coalesce(sum(l.est_cost), 0) as gross_profit,
  count(l.id)                                                   as line_count
from estimates e
left join estimate_lines l on l.estimate_id = e.id
group by e.tenant_id, e.id, e.customer_id, e.status;
grant select on estimate_profitability to mop_app;
