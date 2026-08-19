-- 105_schedule_approval_and_home_base.sql
--
-- 1. THE HOME BASE PIN. Owner supplied the coordinates 19 Aug 2026; every
--    distance and fuel calculation runs from here to the site (§3.5).
update settings
   set value = value || jsonb_build_object('lat', 25.378096, 'lng', 55.461512),
       updated_at = now()
 where key = 'operations.home_base'
   and tenant_id = (select id from tenants where name = 'Mumtaz Integrated Services Group');

-- 2. THE SCHEDULE APPROVAL QUEUE (§3.4).
--
-- The 24-hour customer notice currently goes out for EVERY job scheduled
-- tomorrow, the moment the schedule is generated. §3.4 makes it fire on
-- APPROVAL instead: the office reviews tonight's and tomorrow's schedule,
-- adjusts it, approves it, and only then are customers told. Telling a customer
-- about a visit the office has not yet agreed to is worse than telling them late.
--
-- Keyed on operating_date, not scheduled_date, because a night visit that starts
-- at 23:00 belongs to the operating day the office is approving — the same key
-- the jobs table already assigns by trigger.
create table if not exists schedule_approvals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  operating_date date not null,
  shift_id       uuid references shifts(id),   -- null = the whole day
  approved_at    timestamptz not null default now(),
  approved_by    uuid,
  job_count      int  not null default 0,      -- what was approved, as it stood
  note           text,
  unique (tenant_id, operating_date, shift_id)
);
create index if not exists schedule_approvals_day_idx
  on schedule_approvals (tenant_id, operating_date);

comment on table schedule_approvals is
  'The office has reviewed and approved this operating day (optionally one shift of it). Customer 24h notices are gated on this — §3.4.';

-- Append-only: an approval is a record that a human agreed to a schedule at a
-- point in time. Withdrawing one is a new decision, not an edit of the old one.
create or replace function schedule_approvals_insert_only()
returns trigger language plpgsql as $$
begin
  raise exception 'schedule_approvals is append-only: approving again is a new row, not an edit';
end $$;
drop trigger if exists schedule_approvals_append_only on schedule_approvals;
create trigger schedule_approvals_append_only
  before update or delete on schedule_approvals
  for each row execute function schedule_approvals_insert_only();

alter table schedule_approvals enable row level security;
drop policy if exists tenant_isolation on schedule_approvals;
create policy tenant_isolation on schedule_approvals
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert on schedule_approvals to mop_app;
