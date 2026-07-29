-- 021_cost_capture.sql
-- Tier 1 · Item 2 (job costing) — capture layer: the two allocation inputs.
--   * job_labour_entries — actual time on a job PER TECHNICIAN. Labour is summed
--     across all technicians who actually performed the work (job_assignments,
--     owner-confirmed — never an absent team member). A row is an optional,
--     precise per-tech override; when absent, 023 falls back to the job duration
--     (device_started_at..device_completed_at) for each assigned technician.
--   * job_distance — distance travelled per job for vehicle allocation. Primary
--     source is the RouteProvider (server-side, Art. XVII); manual/odometer also
--     allowed. When NO row exists, 023 falls back to a time-share and flags the
--     job cost as estimated (the confidence flag lands on job_costs in 023).
--
-- These are OPERATIONAL capture — mutable, refined as data syncs in; they are not
-- the financial record. The frozen cost snapshot is job_costs (023). RLS
-- tenant-isolated. Additive; no append-only/ledger/version invariant touched.

create table job_labour_entries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  job_id          uuid not null references jobs(id),
  technician_id   uuid not null references technicians(id),
  time_in         timestamptz,
  time_out        timestamptz,
  minutes         numeric check (minutes is null or minutes >= 0),   -- explicit override; else derived
  source          text not null default 'clocked' check (source in ('clocked','manual','job_duration')),
  note            text,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (job_id, technician_id),
  check (time_in is null or time_out is null or time_out >= time_in)
);
create index job_labour_entries_job_idx on job_labour_entries (job_id);
create trigger job_labour_entries_touch before update on job_labour_entries for each row execute function set_updated_at();
alter table job_labour_entries enable row level security;
create policy tenant_isolation on job_labour_entries
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on job_labour_entries to mop_app;

create table job_distance (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  job_id          uuid not null references jobs(id),
  distance_km     numeric not null check (distance_km >= 0),
  source          text not null check (source in ('route','odometer','manual')),
  captured_at     timestamptz not null default now(),
  note            text,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (job_id)   -- one authoritative distance per job; absence => 023 estimates
);
create index job_distance_job_idx on job_distance (job_id);
create trigger job_distance_touch before update on job_distance for each row execute function set_updated_at();
alter table job_distance enable row level security;
create policy tenant_isolation on job_distance
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on job_distance to mop_app;
