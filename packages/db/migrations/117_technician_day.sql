-- 117_technician_day.sql
-- §3.7 — the technician's day: uniform checklist, TIME IN, TIME OUT, working
-- hours. §3.8 — the fuel bands as actually specified.
--
-- 1. THE UNIFORM. The owner named it exactly: t-shirt, pants, socks, safety
--    shoes, mask. The checklist held a PPE list (coverall, gloves, goggles,
--    boots, mask) which is a different thing: PPE is what protects you, the
--    uniform is what you turn up in. Both are checked; they are not the same
--    list, so the uniform items are added under their own kind rather than
--    bent into the PPE one.
-- 'uniform' is a new kind; the check allowed only ppe and equipment.
alter table preflight_checklist_items drop constraint if exists preflight_checklist_items_kind_check;
alter table preflight_checklist_items add constraint preflight_checklist_items_kind_check
  check (kind = any (array['ppe', 'equipment', 'uniform']));

insert into preflight_checklist_items (tenant_id, kind, code, label, sort_order, is_active, is_assumed)
select t.id, 'uniform', v.code, v.label, v.ord, true, false
  from tenants t
 cross join (values
   ('tshirt',       'T-shirt',      1),
   ('pants',        'Pants',        2),
   ('socks',        'Socks',        3),
   ('safety_shoes', 'Safety shoes', 4),
   ('mask',         'Mask',         5)
 ) as v(code, label, ord)
 where not exists (select 1 from preflight_checklist_items x
                    where x.tenant_id = t.id and x.kind = 'uniform' and x.code = v.code);

-- 2. TIME IN / TIME OUT. preflight_checks is already the one row per technician
--    per day (unique on tenant+technician+date), so the day's clock belongs on
--    it rather than in a second table that could disagree about what day it is.
alter table preflight_checks
  add column if not exists uniform    jsonb,
  add column if not exists time_in    timestamptz,
  add column if not exists time_out   timestamptz;

comment on column preflight_checks.uniform is
  'The uniform checklist as ticked at sign-in: {tshirt:true, pants:true, ...}. Separate from ppe, which is protective equipment.';
comment on column preflight_checks.time_in is 'When the technician started the day. Set once; a second TIME IN does not move it.';
comment on column preflight_checks.time_out is 'When the technician ended the day. Working hours are time_out - time_in.';

-- You cannot leave before you arrive.
alter table preflight_checks drop constraint if exists preflight_checks_time_order;
alter table preflight_checks add constraint preflight_checks_time_order
  check (time_in is null or time_out is null or time_out >= time_in);

-- Working hours, derived — never stored, so it cannot drift from the clock.
create or replace view technician_working_hours as
  select pc.tenant_id, pc.technician_id, t.full_name, pc.check_date,
         pc.time_in, pc.time_out,
         case when pc.time_in is not null and pc.time_out is not null
              then round(extract(epoch from (pc.time_out - pc.time_in)) / 3600.0, 2)
         end as hours,
         pc.attendance, pc.uniform, pc.present
    from preflight_checks pc
    join technicians t on t.id = pc.technician_id;

comment on view technician_working_hours is
  '3.7: hours worked per technician per day, derived from time_in/time_out. Feeds payroll and the daily KPI card.';

grant select on technician_working_hours to mop_app;

-- 3. FUEL BANDS (§3.8). The check allowed 0/25/50/75/100 — four quarters. The
--    specified bands are eight: CRITICALLY LOW, <10, <20, <40, <60, <80, <100,
--    FULL. A technician forced to call a nearly-empty tank "25%" is being made
--    to enter something untrue, and the refuel reconciliation inherits it.
alter table preflight_checks drop constraint if exists preflight_checks_fuel_band_check;
alter table preflight_checks add constraint preflight_checks_fuel_band_check
  check (fuel_band is null or fuel_band = any (array[0, 10, 20, 40, 60, 80, 99, 100]));

comment on column preflight_checks.fuel_band is
  '3.8 bands as the upper bound of the band: 0=CRITICALLY LOW, 10=<10%, 20=<20%, 40=<40%, 60=<60%, 80=<80%, 99=<100%, 100=FULL.';
