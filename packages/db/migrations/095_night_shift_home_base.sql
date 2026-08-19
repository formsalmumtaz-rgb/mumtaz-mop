-- 095_night_shift_home_base.sql
-- Night shift as a first-class fact, and the depot the routing measures from.
--
-- CLOSING TIME IS PER BRANCH, not per customer: two outlets of the same chain
-- close at different hours, and a night visit is scheduled AFTER that outlet's
-- own closing time. Storing it on the customer would force one time on every
-- site and quietly mis-schedule the others.
alter table customers
  add column if not exists night_shift_service boolean;

alter table customer_branches
  add column if not exists night_shift_service boolean,
  add column if not exists closing_time time;

comment on column customer_branches.closing_time is
  'When THIS outlet closes. A night visit is sequenced after it; route, labour and arrival times are computed from this time, never from a fixed shift start.';
comment on column customers.night_shift_service is
  'Default for new sites of this customer. The branch value is what the scheduler reads.';

-- Home base / depot: every distance, fuel and travel-time figure is measured
-- from here to the site pin. Configurable, never hard-coded in the engine.
insert into settings (tenant_id, service_line_id, key, value, description, is_assumed)
select t.id, null, 'operations.home_base',
  jsonb_build_object(
    'name', 'Ajman New Industrial Area depot',
    'address', 'Ajman New Industrial Area, Etihad Road (near Gift Way Home), Ajman',
    'lat', null, 'lng', null),
  'The depot all distance/fuel/time calculations start from. Set the pin from Settings once the maps key is live; until then distance falls back to the configured road factor.',
  false
from tenants t
on conflict (tenant_id, service_line_id, key) do nothing;
