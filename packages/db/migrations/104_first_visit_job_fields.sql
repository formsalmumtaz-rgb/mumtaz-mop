-- 104_first_visit_job_fields.sql
-- The three attributes a confirmed first visit records on its job (§3.3).
-- jobs.attributes is guarded by tg_validate_attributes('job'), which refuses any
-- undeclared key — so these are declared here rather than discovered at runtime.
--
--   first_visit        this job is a contract's first visit
--   first_visit_basis  which of the §3.3 rules produced it (area_day_this_week /
--                      near_area_this_week / area_day_next_week), so the choice
--                      stays auditable after the fact
--   off_pattern        rule (b) only: a team was passing NEAR, not serving this
--                      area. The technician seeing it on the round needs to know
--                      it is not part of that day's normal pattern.
insert into field_definitions
  (tenant_id, service_line_id, entity_type, field_key, label, data_type, is_required, is_assumed)
select t.id, null, 'job', d.field_key, d.label, d.data_type, false, false
  from tenants t
 cross join (values
   ('first_visit',       'First visit of the contract', 'text'),
   ('first_visit_basis', 'How the first visit was slotted', 'text'),
   ('off_pattern',       'Off-pattern (added to a nearby round)', 'text')
 ) as d(field_key, label, data_type)
on conflict (tenant_id, coalesce(service_line_id, '00000000-0000-0000-0000-000000000000'::uuid),
             coalesce(facility_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
             entity_type, field_key)
do nothing;
