-- 140_engagement_and_frequency_up_front.sql
-- Item 7. "One-off or AMC?" is the first thing that changes everything
-- downstream — whether a frequency exists, whether the contract renews,
-- whether the schedule generates visits — and it was being discovered at the
-- CONTRACT, three screens after the decision was actually made.
--
-- estimates.engagement_type already exists (the quotation carries it). What was
-- missing: the survey could not record it at all, so it was re-asked; and the
-- frequency had no default, so every recurring sale started from a blank
-- dropdown when the premises type already implies the answer.

alter table surveys add column if not exists engagement_type text;
alter table surveys add column if not exists frequency_id uuid references frequencies(id);
alter table surveys add column if not exists facility_type_id uuid references facility_types(id);

alter table surveys drop constraint if exists surveys_engagement_type_check;
alter table surveys add constraint surveys_engagement_type_check
  check (engagement_type is null or engagement_type in ('one_off', 'recurring'));

comment on column surveys.engagement_type is
  'one_off or recurring, asked at survey creation. Everything downstream inherits it: a one-off never shows a frequency, an AMC or a renewal, and the contract never asks again (item 7).';
comment on column surveys.facility_type_id is
  'What the premises IS. Drives the suggested frequency, the night-shift default and the survey question set.';

-- Frequency suggested BY premises type. F&B is 24/yr because that is what the
-- municipality expects of food premises; an office is not.
alter table facility_types add column if not exists default_frequency_id uuid references frequencies(id);
comment on column facility_types.default_frequency_id is
  'The frequency a recurring sale for these premises starts at — shown immediately at the survey, adjustable. A blank dropdown when the answer is implied is how a new person gets it wrong (item 7).';

-- Map each premises type to a frequency by VISITS PER YEAR. The table stores
-- period_unit/period_count/visits_per_period rather than an annual figure, so
-- the annual rate is derived here instead of being assumed to exist.
with per_year as (
  select f.id, f.tenant_id, f.service_line_id,
         case f.period_unit
           when 'day'   then f.visits_per_period * 365.0 / nullif(f.period_count, 0)
           when 'week'  then f.visits_per_period * 52.0  / nullif(f.period_count, 0)
           when 'month' then f.visits_per_period * 12.0  / nullif(f.period_count, 0)
           when 'year'  then f.visits_per_period * 1.0   / nullif(f.period_count, 0)
         end as py
    from frequencies f
   where f.is_active
), wanted(code, py) as (values
  ('hotel', 24), ('restaurant', 24), ('cafeteria', 24), ('grocery', 12),
  ('supermarket', 24), ('hypermarket', 24), ('production_facility', 24),
  ('residential_building', 12), ('villa', 4), ('apartment', 4),
  ('office', 12), ('factory', 12), ('warehouse', 12), ('mosque', 12),
  ('school', 12), ('clinic', 12), ('hospital', 24), ('pharmacy', 12),
  ('labour_camp', 12), ('construction', 12), ('mall_retail_complex', 24),
  ('ship_vessel_rig', 4)
)
-- A correlated subquery rather than a lateral join: an UPDATE ... FROM cannot
-- reference the target table from inside a lateral, which is exactly the shape
-- "nearest frequency to N visits a year, within this tenant and division" wants.
update facility_types ft
   set default_frequency_id = (
     select p.id from per_year p
      where p.tenant_id = ft.tenant_id
        and p.service_line_id = ft.service_line_id
        and p.py is not null
      order by abs(p.py - w.py), p.py
      limit 1)
  from wanted w
 where ft.code = w.code
   and ft.default_frequency_id is null;
