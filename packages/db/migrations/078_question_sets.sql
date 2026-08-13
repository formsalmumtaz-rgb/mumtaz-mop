-- 078_question_sets.sql
-- Question sets seeded into the field_definitions substrate (refresh item 8),
-- structured after how the leading pest platforms (PestPac, FieldRoutes,
-- GorillaDesk) shape their intake/survey/inspection forms: per-service-type
-- survey questions, registration extras, and job-level treatment capture.
-- ALL ASSUMED, all editable from /settings/field-definitions (the admin screen).
-- Service-type scoping rides key prefixes (gpc_/termite_/bedbug_/rodent_) —
-- field_definitions scopes by service LINE; finer scoping is a later refinement.
-- Complaint-intake questions await a complaints module (entity type not yet in
-- the validator) — noted, not seeded.

do $$
declare v_t uuid;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';

  insert into field_definitions (tenant_id, service_line_id, entity_type, field_key, label, data_type, is_required, enum_values, is_assumed, created_at)
  select v_t, null, x.et, x.k, x.l, x.dt, false, x.ev, true, now()
  from (values
    -- ── customer registration extras ──
    ('customer', 'industry', 'Industry / activity', 'enum', array['restaurant','cafe','supermarket','food_processing','hotel','residential','office','retail','warehouse','medical','educational','worship','construction','other']),
    ('customer', 'preferred_language', 'Preferred language', 'enum', array['en','ar']),
    ('customer', 'lead_source', 'How did they find us?', 'enum', array['referral','website','walk_in','phone','repeat','other']),
    -- ── survey: General Pest Control ──
    ('survey', 'kitchen_area_sqm', 'Kitchen area (m²)', 'number', null),
    ('survey', 'pantry_count', 'Number of pantries', 'integer', null),
    ('survey', 'washing_areas_count', 'Washing/dishwash areas', 'integer', null),
    ('survey', 'storage_areas_count', 'Storage areas', 'integer', null),
    ('survey', 'floors_count', 'Number of floors', 'integer', null),
    ('survey', 'total_area_sqm', 'Total premises area (m²)', 'number', null),
    ('survey', 'kitchen_staff_count', 'Kitchen staff', 'integer', null),
    ('survey', 'pest_evidence', 'Pest evidence observed', 'enum', array['none','cockroach','ant','fly','mosquito','rodent_droppings','rodent_sighting','bedbug','termite_mud_tubes','multiple']),
    ('survey', 'infestation_level', 'Infestation level', 'enum', array['none','low','medium','high','severe']),
    ('survey', 'access_constraints', 'Access constraints', 'text', null),
    ('survey', 'operating_hours', 'Operating hours', 'text', null),
    ('survey', 'night_access_required', 'Night access required?', 'boolean', null),
    -- ── survey: Termite ──
    ('survey', 'termite_structure_type', 'Structure type (termite)', 'enum', array['villa','building','warehouse','under_construction','other']),
    ('survey', 'termite_soil_access', 'Soil access available?', 'boolean', null),
    ('survey', 'termite_previous_treatment', 'Previous termite treatment (when/what)', 'text', null),
    -- ── survey: Bedbug ──
    ('survey', 'bedbug_rooms_count', 'Rooms affected (bedbug)', 'integer', null),
    ('survey', 'bedbug_furniture_density', 'Furniture density', 'enum', array['light','normal','dense']),
    ('survey', 'bedbug_laundry_access', 'Laundry access on site?', 'boolean', null),
    -- ── survey: Rodent ──
    ('survey', 'rodent_entry_points', 'Entry points observed', 'text', null),
    ('survey', 'rodent_bait_stations_proposed', 'Bait stations proposed', 'integer', null),
    ('survey', 'rodent_exterior_perimeter_m', 'Exterior perimeter (m)', 'number', null),
    -- ── job: pest-specific treatment capture (GorillaDesk-style compliance record) ──
    ('job', 'application_method', 'Application method', 'enum', array['spray','gel','bait','dusting','fogging','trap']),
    ('job', 'target_pest', 'Target pest', 'enum', array['cockroach','ant','fly','mosquito','rodent','bedbug','termite','general']),
    ('job', 'areas_treated', 'Areas treated', 'text', null),
    ('job', 'pre_treatment_findings', 'Pre-treatment findings', 'text', null)
  ) as x(et, k, l, dt, ev)
  where not exists (select 1 from field_definitions f
                     where f.tenant_id = v_t and f.service_line_id is null
                       and f.entity_type = x.et and f.field_key = x.k);
end $$;
