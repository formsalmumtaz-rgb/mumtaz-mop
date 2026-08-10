-- 046_manpower.sql
-- Manpower supply (§10). A manpower engagement is a CONTRACT (extends the shared
-- commercial substrate, Art. XVIII §2 — not a parallel structure) with a 1:1
-- manpower agreement detail and monthly timesheets. Monthly revenue/cost/profit
-- are DETERMINISTIC arithmetic snapshotted onto each timesheet at entry (no AI in
-- the calculation; AI may later advise on margins, never compute them).

create table manpower_agreements (
  id                             uuid primary key default gen_random_uuid(),
  tenant_id                      uuid not null references tenants(id),
  contract_id                    uuid not null references contracts(id) unique,  -- 1:1 with a contract
  billing_basis                  text not null check (billing_basis in ('fixed_monthly','per_person_month','per_hour')),
  personnel_count                integer not null default 1 check (personnel_count >= 1),
  rate                           numeric not null default 0 check (rate >= 0),   -- monthly flat / per-person-month / per-hour
  salary_cost_per_person_monthly numeric not null default 0 check (salary_cost_per_person_monthly >= 0),
  accommodation_cost_monthly     numeric not null default 0 check (accommodation_cost_monthly >= 0),
  other_cost_monthly             numeric not null default 0 check (other_cost_monthly >= 0),
  notes                          text,
  is_assumed                     boolean not null default false,
  assumed_note                   text,
  created_at                     timestamptz not null default now(), created_by uuid,
  updated_at                     timestamptz not null default now(), updated_by uuid
);
create index manpower_agreements_tenant_idx on manpower_agreements (tenant_id);
create trigger manpower_agreements_touch before update on manpower_agreements for each row execute function set_updated_at();
alter table manpower_agreements enable row level security;
create policy tenant_isolation on manpower_agreements using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on manpower_agreements to mop_app;

-- Monthly actuals. revenue/cost/profit are snapshotted at entry (deterministic),
-- so later edits to the agreement never rewrite a booked month.
create table manpower_timesheets (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  contract_id      uuid not null references contracts(id),
  period           date not null,                                  -- first day of the month
  personnel_count  integer not null default 0 check (personnel_count >= 0),
  hours_worked     numeric not null default 0 check (hours_worked >= 0),
  revenue          numeric not null default 0,
  cost             numeric not null default 0,
  profit           numeric not null default 0,
  notes            text,
  created_at       timestamptz not null default now(), created_by uuid,
  updated_at       timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, contract_id, period)
);
create index manpower_timesheets_contract_idx on manpower_timesheets (contract_id, period);
create trigger manpower_timesheets_touch before update on manpower_timesheets for each row execute function set_updated_at();
alter table manpower_timesheets enable row level security;
create policy tenant_isolation on manpower_timesheets using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on manpower_timesheets to mop_app;

-- Deterministic monthly revenue for a manpower month. STABLE, pure arithmetic.
create or replace function fn_manpower_revenue(p_basis text, p_rate numeric, p_personnel integer, p_hours numeric)
returns numeric language sql immutable as $$
  select round(case p_basis
    when 'fixed_monthly'     then coalesce(p_rate,0)
    when 'per_person_month'  then coalesce(p_rate,0) * coalesce(p_personnel,0)
    when 'per_hour'          then coalesce(p_rate,0) * coalesce(p_hours,0)
    else 0 end, 2) $$;

create or replace function fn_manpower_cost(p_salary numeric, p_personnel integer, p_accommodation numeric, p_other numeric)
returns numeric language sql immutable as $$
  select round(coalesce(p_salary,0) * coalesce(p_personnel,0) + coalesce(p_accommodation,0) + coalesce(p_other,0), 2) $$;
