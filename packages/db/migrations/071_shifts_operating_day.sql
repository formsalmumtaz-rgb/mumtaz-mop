-- 071_shifts_operating_day.sql
-- Night shift as a first-class concept (DOCUMENT 8 Part D / ROADMAP §6 Q4 — was
-- genuinely absent: no shift existed anywhere; jobs assumed one daytime window).
--
--   * shifts — per-tenant/-division shift windows (seeded ASSUMED: day 08:00-18:00,
--     night 22:00-06:00). Editable reference data, Art. X §4.
--   * jobs.shift_id + jobs.operating_date — a 02:00 job belongs to the PREVIOUS
--     operating day. Deterministic rule (ASSUMED, documented here): when the job's
--     shift crosses midnight and its start time is before noon, operating_date =
--     scheduled_date - 1; otherwise operating_date = scheduled_date. Maintained by
--     trigger; operating_date is what attendance/route windows/day queries group by.
--   * customer_branches.preferred_shift_id — F&B sites default to night (spray at
--     night; gel in daytime rides the visit type, not the shift). Auto-flagged for
--     restaurant-like facility types, ASSUMED + editable per site.
--
-- Invariants untouched: jobs is not append-only; new columns + trigger only.

create table if not exists shifts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  code            text not null,
  name            text not null,
  start_time      time not null,
  end_time        time not null,               -- end < start ⇒ crosses midnight
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
alter table shifts enable row level security;
drop policy if exists tenant_isolation on shifts;
create policy tenant_isolation on shifts
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on shifts to mop_app;

alter table jobs add column if not exists shift_id uuid references shifts(id);
alter table jobs add column if not exists operating_date date;
alter table customer_branches add column if not exists preferred_shift_id uuid references shifts(id);

-- operating-day assignment (deterministic; rule ASSUMED as documented above)
create or replace function assign_job_operating_date()
returns trigger language plpgsql as $$
declare
  v_crosses boolean;
begin
  if new.scheduled_date is null then
    new.operating_date := null;
    return new;
  end if;
  v_crosses := false;
  if new.shift_id is not null then
    select (end_time < start_time) into v_crosses from shifts where id = new.shift_id;
  end if;
  if coalesce(v_crosses, false) and new.scheduled_start is not null and new.scheduled_start < time '12:00' then
    new.operating_date := new.scheduled_date - 1;
  else
    new.operating_date := new.scheduled_date;
  end if;
  return new;
end $$;
drop trigger if exists jobs_operating_date on jobs;
create trigger jobs_operating_date
  before insert or update of scheduled_date, scheduled_start, shift_id on jobs
  for each row execute function assign_job_operating_date();

-- backfill existing jobs (no night shifts exist yet, so operating = scheduled)
update jobs set operating_date = scheduled_date where operating_date is null and scheduled_date is not null;

-- seed shifts + F&B night preference (ASSUMED, editable)
do $$
declare
  v_tenant uuid; v_sl uuid; v_night uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';

  insert into shifts (tenant_id, service_line_id, code, name, start_time, end_time, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'day',   'Day shift',   time '08:00', time '18:00', true, 'ASSUMED window - confirm'),
    (v_tenant, v_sl, 'night', 'Night shift', time '22:00', time '06:00', true, 'ASSUMED window (crosses midnight) - confirm')
  on conflict (tenant_id, service_line_id, code) do nothing;

  select id into v_night from shifts where tenant_id = v_tenant and service_line_id = v_sl and code = 'night';

  -- F&B sites default to night shift (restaurant-like facility types), ASSUMED
  update customer_branches b
     set preferred_shift_id = v_night,
         is_assumed = true,
         assumed_note = coalesce(assumed_note || ' · ', '') || 'Night-shift preference auto-flagged (F&B) - confirm'
   where b.tenant_id = v_tenant and b.preferred_shift_id is null
     and exists (select 1 from facility_types ft
                  where ft.id = b.facility_type_id
                    and (ft.code ilike '%rest%' or ft.name ilike '%rest%' or ft.code ilike '%f&b%' or ft.name ilike '%food%'));
end $$;
