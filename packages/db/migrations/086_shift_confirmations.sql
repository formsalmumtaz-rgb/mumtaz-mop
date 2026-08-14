-- 086_shift_confirmations.sql
-- Vision P5.C — "Sign in for today": the technician confirms their team
-- assignment for the day, and that confirmation IS the attendance cross-check.
-- Operations assigns; the technician confirms; never self-assigns. One row per
-- technician per day (insert-only; corrections are the office's job).

create table if not exists shift_confirmations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  technician_id uuid not null references technicians(id),
  team_id       uuid references teams(id),      -- the team as confirmed (their open assignment)
  shift_date    date not null default current_date,
  confirmed_at  timestamptz not null default now(),
  device_time   timestamptz,
  unique (tenant_id, technician_id, shift_date)
);
create index if not exists shift_confirmations_day_idx on shift_confirmations (tenant_id, shift_date);

create or replace function shift_confirmations_insert_only()
returns trigger language plpgsql as $$
begin
  raise exception 'shift_confirmations is append-only (attendance record)';
end $$;
drop trigger if exists shift_confirmations_append_only on shift_confirmations;
create trigger shift_confirmations_append_only
  before update or delete on shift_confirmations
  for each row execute function shift_confirmations_insert_only();

alter table shift_confirmations enable row level security;
drop policy if exists tenant_isolation on shift_confirmations;
create policy tenant_isolation on shift_confirmations
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert on shift_confirmations to mop_app;
