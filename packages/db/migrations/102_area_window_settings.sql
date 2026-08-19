-- 102_area_window_settings.sql
-- §3.3 area-window first-visit scheduling — the two values the rule needs and
-- nobody has ratified. Seeded ASSUMED and editable from settings without a
-- deploy (Art. X §4); the UI shows them flagged wherever a suggestion cites them.
--
-- There is deliberately NO new area/zone master table. An "area" is the district
-- already recorded on the customer, and a team's area-day pattern is derived from
-- the jobs already on the schedule — which is exactly what §3.3 describes ("the
-- customer's area is already scheduled for a team this week on a coming day").
-- Inventing a route master would be a second source of truth about where teams go.
insert into settings (tenant_id, service_line_id, key, value, is_assumed, description)
select t.id, null, s.key, s.value, true, s.note
  from tenants t
 cross join (values
   ('scheduling.week_start_day', '"monday"'::jsonb,
    'ASSUMED: the working week starts Monday. Decides what "this week" means when slotting a first visit.'),
   ('scheduling.near_area_km', '5'::jsonb,
    'ASSUMED: a team passing within 5 km of the site counts as "near" for an off-pattern first visit.')
 ) as s(key, value, note)
 -- NOT "on conflict": the unique constraint is (tenant_id, service_line_id, key)
 -- and service_line_id is NULL here, and NULLs never conflict in Postgres — so
 -- on-conflict would silently insert a duplicate on every re-run.
 where not exists (
   select 1 from settings x
    where x.tenant_id = t.id and x.service_line_id is null and x.key = s.key);
