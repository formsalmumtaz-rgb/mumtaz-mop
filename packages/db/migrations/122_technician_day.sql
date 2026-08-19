-- 122_technician_day.sql
-- CORRECTING mig 117. I put the uniform check and TIME IN/TIME OUT on
-- preflight_checks. That table may only be written by a TEAM LEAD — enforced by
-- enforce_preflight_authority (mig 066), because a technician must never mark
-- their own crew's attendance. So a plain technician physically could not clock
-- themselves in, which is the first thing §3.7 asks them to do.
--
-- The two things are not the same fact and do not share an owner:
--   * the PRE-FLIGHT is the lead's declaration ABOUT THE CREW AND THE VAN —
--     who turned up, what stock is aboard, what the gauge reads. Lead only.
--   * the PERSONAL DAY is the individual's own record of THEMSELVES — I am here,
--     I am in uniform, I started at 07:05, I finished at 17:35. Theirs alone.
-- Merging them meant one authority rule had to give. Separating them means
-- neither does.
create table if not exists technician_day (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  technician_id uuid not null references technicians(id),
  work_date     date not null default current_date,
  present       boolean not null default true,
  uniform       jsonb,
  time_in       timestamptz,
  time_out      timestamptz,
  client_uuid   uuid,
  device_time   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, technician_id, work_date)
);

create index if not exists technician_day_day_idx on technician_day (tenant_id, work_date);

comment on table technician_day is
  'A technician''s own record of their own day: present, in uniform, clocked in and out. Written by that technician. Distinct from preflight_checks, which is the LEAD''s declaration about the crew and the van (3.7).';
comment on column technician_day.time_in is
  'Set ONCE. Re-opening the app later must not move the start of the shift or an hour of pay disappears.';

alter table technician_day drop constraint if exists technician_day_time_order;
alter table technician_day add constraint technician_day_time_order
  check (time_in is null or time_out is null or time_out >= time_in);

alter table technician_day enable row level security;
drop policy if exists tenant_isolation on technician_day;
create policy tenant_isolation on technician_day
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update on technician_day to mop_app;

-- Working hours now come from the technician's OWN record. The view is dropped
-- and recreated rather than replaced: its column set changes, and the old one
-- also holds a dependency on the preflight columns being dropped below.
drop view if exists technician_working_hours;
create view technician_working_hours as
  select d.tenant_id, d.technician_id, t.full_name, d.work_date as check_date,
         d.time_in, d.time_out,
         case when d.time_in is not null and d.time_out is not null
              then round(extract(epoch from (d.time_out - d.time_in)) / 3600.0, 2)
         end as hours,
         d.present, d.uniform
    from technician_day d
    join technicians t on t.id = d.technician_id;

grant select on technician_working_hours to mop_app;

-- The mig-117 columns are dropped: nothing wrote to them, and leaving a second
-- place to record a clock-in is how two answers to "when did he start?" appear.
alter table preflight_checks
  drop column if exists uniform,
  drop column if exists time_in,
  drop column if exists time_out;
