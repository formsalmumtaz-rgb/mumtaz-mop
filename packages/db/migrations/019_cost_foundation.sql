-- 019_cost_foundation.sql
-- Tier 1 · Item 2 (job costing) — foundation: the fully-loaded employment cost
-- of a technician, plus the standard-rate / overhead settings and labour GL
-- accounts the later migrations post to. No ledger postings here (those land in
-- 022); this migration only establishes the cost basis.
--
-- Owner-confirmed model (session 2026-07-29):
--   * Cost basis is EMPLOYMENT cost, not basic salary: basic + accommodation +
--     transport + medical + air ticket + gratuity accrual (21 days/yr of basic)
--     + visa & Emirates ID amortised over 24 months.
--   * Standard productive hours = 176/month (22 × 8) — NOT paid hours; travel,
--     depot loading, vehicle checks and site waiting are not billable. Each cost
--     version freezes its own denominator so historical costs stay correct.
--   * Effective-dated & immutable (reuse enforce_version_immutable): editing a
--     component opens a NEW version; the value columns never change in place, so
--     a job costed last month keeps the rate that was in force then.
--   * monthly_employment_cost and hourly_cost are GENERATED STORED columns — the
--     derivation is in the database, cannot drift, and is frozen with the version.
--
-- Gratuity: flat 21 days/year of basic (UAE first-5-years rule). Daily basic =
-- basic/30; annual accrual = basic/30 * days; monthly = /12. The 30-day step-up
-- past 5 years is deferred (owner will revisit).
--
-- Additive. New table is version-immutable (not append-only) + RLS tenant-isolated.

create table employee_cost_components (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references tenants(id),
  service_line_id             uuid references service_lines(id),
  technician_id               uuid not null references technicians(id),
  version_no                  integer not null,
  effective_from              date not null default current_date,
  effective_to                date,
  -- monthly components (AED)
  basic_salary                numeric not null default 0 check (basic_salary >= 0),
  accommodation_monthly       numeric not null default 0 check (accommodation_monthly >= 0),
  transport_allowance_monthly numeric not null default 0 check (transport_allowance_monthly >= 0),
  -- annual components (AED/year) — amortised to monthly at /12
  medical_insurance_annual    numeric not null default 0 check (medical_insurance_annual >= 0),
  air_ticket_annual           numeric not null default 0 check (air_ticket_annual >= 0),
  -- one-off components (AED) — amortised over visa_eid_amortisation_months
  visa_cost                   numeric not null default 0 check (visa_cost >= 0),
  emirates_id_cost            numeric not null default 0 check (emirates_id_cost >= 0),
  visa_eid_amortisation_months integer not null default 24 check (visa_eid_amortisation_months > 0),
  -- accrual + denominator parameters (frozen per version)
  gratuity_days_per_year      numeric not null default 21 check (gratuity_days_per_year >= 0),
  productive_hours_month      numeric not null default 176 check (productive_hours_month > 0),
  -- derived (generated, stored) — fully-loaded monthly cost and the hourly rate
  monthly_employment_cost numeric generated always as (
      basic_salary
    + accommodation_monthly
    + transport_allowance_monthly
    + medical_insurance_annual / 12.0
    + air_ticket_annual / 12.0
    + (basic_salary / 30.0 * gratuity_days_per_year) / 12.0
    + (visa_cost + emirates_id_cost) / visa_eid_amortisation_months
  ) stored,
  hourly_cost numeric generated always as (
    (
      basic_salary
    + accommodation_monthly
    + transport_allowance_monthly
    + medical_insurance_annual / 12.0
    + air_ticket_annual / 12.0
    + (basic_salary / 30.0 * gratuity_days_per_year) / 12.0
    + (visa_cost + emirates_id_cost) / visa_eid_amortisation_months
    ) / productive_hours_month
  ) stored,
  is_assumed                  boolean not null default false,
  assumed_note                text,
  source_ref                  text,
  created_at                  timestamptz not null default now(), created_by uuid,
  unique (technician_id, version_no),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index employee_cost_one_open on employee_cost_components (technician_id) where effective_to is null;
create index employee_cost_tech_idx on employee_cost_components (technician_id);
create trigger employee_cost_components_immutable before update or delete on employee_cost_components
  for each row execute function enforce_version_immutable();

alter table employee_cost_components enable row level security;
create policy tenant_isolation on employee_cost_components
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on employee_cost_components to mop_app;

-- ── Standard-rate / overhead settings + labour GL accounts ─────────────
do $$
declare v_tenant uuid; v_sl uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  if v_tenant is null then return; end if;
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';

  -- costing parameters (ASSUMED where a real figure is owner-set; editable)
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, v_sl,  'cost.standard_productive_hours_month', '176'::jsonb, 'Productive hours/month for hourly-cost denominator (22×8; excludes travel/loading/waiting)', false),
    (v_tenant, v_sl,  'cost.gratuity_days_per_year',          '21'::jsonb,  'Gratuity accrual days/year of basic (first 5 years)', false),
    (v_tenant, v_sl,  'cost.visa_eid_amortisation_months',    '24'::jsonb,  'Visa + Emirates ID amortisation period (months)', false),
    (v_tenant, v_sl,  'cost.standard_labour_rate_hourly',     '0'::jsonb,   'STANDARD labour absorption rate (AED/hr) — set before enabling absorption', true),
    (v_tenant, v_sl,  'cost.overhead_enabled',                'false'::jsonb, 'Absorb overhead into job cost? Reports label it excluded when off', false),
    (v_tenant, v_sl,  'cost.overhead_rate_per_labour_hour',   '0'::jsonb,   'Overhead absorption rate per labour hour (AED/hr)', true);

  -- labour GL accounts (ASSUMED codes — confirm against client CoA). Postings wired in 022.
  insert into accounts(tenant_id, code, name, account_type, is_assumed, assumed_note) values
    (v_tenant, '5200', 'Direct Labour Cost',          'expense',   true, 'ASSUMED GL code — confirm'),
    (v_tenant, '5210', 'Labour Cost Variance',        'expense',   true, 'ASSUMED GL code — confirm'),
    (v_tenant, '2290', 'Labour Absorption Clearing',  'liability', true, 'ASSUMED GL code — confirm')
  on conflict (tenant_id, code) do nothing;

  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, null, 'cost.account_code.labour',          '"5200"'::jsonb, 'GL Dr labour into job cost',            true),
    (v_tenant, null, 'cost.account_code.labour_variance', '"5210"'::jsonb, 'GL for labour rate/efficiency variance', true),
    (v_tenant, null, 'cost.account_code.labour_clearing', '"2290"'::jsonb, 'GL absorption clearing (Cr on absorb)',  true);
end $$;
