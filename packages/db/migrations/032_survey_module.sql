-- 032_survey_module.sql
-- Survey Module (Tier 3) — the front of the funnel:
--   Survey (site visit) → Estimation → Price → Profit preview → Quotation → Contract.
--
-- A survey captures what a surveyor observes on site: per-service measurements
-- (area, rooms, linear metres, …) and, optionally, indicative rates. Its lines
-- MIRROR estimate_lines and price with the same fn_price / fn_estimate_cost, so a
-- completed survey shows a profit preview AND seeds an estimate with no re-keying
-- (Constitution "data entered once"). Header attributes are validated against
-- field_definitions (entity_type='survey') — service-driven, not hardcoded
-- (Art. XVIII); no survey fields are invented here.
--
-- Additive & disposable (two-speed): mutable operational capture, RLS-isolated,
-- no ledger/append-only/immutability involved. Nothing existing is weakened.
-- Offline field capture (PWA) is a later technician-app concern.

-- ── Survey header ────────────────────────────────────────────────────────
create table surveys (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  customer_id     uuid references customers(id),
  branch_id       uuid references customer_branches(id),   -- which site was surveyed
  survey_number   text,
  surveyor_id     uuid references technicians(id),         -- who did the site visit
  survey_date     date not null default current_date,
  status          text not null default 'draft'
                  check (status in ('draft','completed','cancelled')),
  property_type   text check (property_type is null or property_type in ('residential','commercial','industrial')),
  attributes      jsonb not null default '{}'::jsonb,      -- service-driven (field_definitions entity_type='survey')
  notes           text,
  estimate_id     uuid references estimates(id),           -- estimate seeded from this survey (set once)
  is_assumed      boolean not null default false,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid
);
create index surveys_customer_idx on surveys(tenant_id, customer_id);
create trigger surveys_touch before update on surveys
  for each row execute function set_updated_at();
create trigger surveys_validate_attributes before insert or update on surveys
  for each row execute function tg_validate_attributes('survey');
alter table surveys enable row level security;
create policy tenant_isolation on surveys using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on surveys to mop_app;

-- ── Survey lines (mirror estimate_lines so seeding an estimate is lossless) ─
create table survey_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  survey_id         uuid not null references surveys(id) on delete cascade,
  service_type_id   uuid references service_types(id),
  pricing_model_id  uuid references pricing_models(id),
  description       text,
  unit_price        numeric not null default 0 check (unit_price >= 0),      -- rate for the model
  measure           numeric not null default 1 check (measure >= 0),         -- single-measure models
  measures          jsonb not null default '{}'::jsonb,                      -- formula models
  line_total        numeric not null default 0 check (line_total >= 0),      -- revenue = fn_price(...)
  est_labour_hours  numeric not null default 0 check (est_labour_hours >= 0),
  est_distance_km   numeric not null default 0 check (est_distance_km >= 0),
  est_material_cost numeric not null default 0 check (est_material_cost >= 0),
  est_cost          numeric not null default 0 check (est_cost >= 0),        -- = fn_estimate_cost(...)
  observed_notes    text,
  seq               integer,
  created_at        timestamptz not null default now(), created_by uuid,
  updated_at        timestamptz not null default now(), updated_by uuid
);
create index survey_lines_survey_idx on survey_lines(survey_id);
create trigger survey_lines_touch before update on survey_lines
  for each row execute function set_updated_at();
alter table survey_lines enable row level security;
create policy tenant_isolation on survey_lines using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on survey_lines to mop_app;

-- ── Profit preview at survey time (identical shape to estimate_profitability) ─
create view survey_profitability with (security_invoker = true) as
select
  s.tenant_id, s.id as survey_id, s.customer_id, s.status,
  coalesce(sum(l.line_total), 0)                                as revenue,
  coalesce(sum(l.est_cost), 0)                                  as est_cost,
  coalesce(sum(l.line_total), 0) - coalesce(sum(l.est_cost), 0) as gross_profit,
  count(l.id)                                                   as line_count
from surveys s
left join survey_lines l on l.survey_id = s.id
group by s.tenant_id, s.id, s.customer_id, s.status;
grant select on survey_profitability to mop_app;
