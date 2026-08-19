-- 106_team_vehicles.sql
-- §3.4 — "drag-drop technicians into teams and vehicles. Persists day-to-day
-- automatically, changeable any day; changes flow to the technician apps."
--
-- Technicians already attach to a team through team_assignments, which is
-- date-effective: an assignment with no effective_to is simply in force until
-- someone changes it, which IS "persists day-to-day". Vehicles had no such link —
-- vehicles.technician_id ties a van to a PERSON, which is a different fact and
-- breaks the moment that person is off. A van belongs to the crew that day.
--
-- Same shape as team_assignments deliberately, so both answer "who/what is on
-- this team today?" the same way and neither needs a nightly job to roll forward.
create table if not exists team_vehicles (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  team_id         uuid not null references teams(id),
  vehicle_id      uuid not null references vehicles(id),
  effective_from  date not null default current_date,
  effective_to    date,
  created_at      timestamptz not null default now(),
  created_by      uuid
);
-- One vehicle can only be on one team at a time. Partial unique index because
-- effective_to IS NULL is what "currently assigned" means.
create unique index if not exists team_vehicles_open_uq
  on team_vehicles (tenant_id, vehicle_id) where effective_to is null;
create index if not exists team_vehicles_team_idx
  on team_vehicles (tenant_id, team_id) where effective_to is null;

comment on table team_vehicles is
  'Which vehicle is with which team, date-effective. An open row (effective_to null) is in force until changed — §3.4.';

alter table team_vehicles enable row level security;
drop policy if exists tenant_isolation on team_vehicles;
create policy tenant_isolation on team_vehicles
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update on team_vehicles to mop_app;

-- The same guard on people: a technician cannot be on two teams at once.
create unique index if not exists team_assignments_open_uq
  on team_assignments (tenant_id, technician_id) where effective_to is null;

-- The date convention, stated once so nobody has to infer it from a query:
-- effective_to is EXCLUSIVE — the day the assignment stopped applying. A move on
-- the same day it was made therefore leaves from = to, meaning "in force for zero
-- days", and the replacement starting the same day does not overlap it.
--   who was on team X on date D:
--     effective_from <= D and (effective_to is null or effective_to > D)
comment on column team_vehicles.effective_to is
  'EXCLUSIVE: the day this assignment stopped applying. NULL = still in force. In force on D when effective_from <= D < effective_to.';
comment on column team_assignments.effective_to is
  'EXCLUSIVE: the day this assignment stopped applying. NULL = still in force. In force on D when effective_from <= D < effective_to.';
