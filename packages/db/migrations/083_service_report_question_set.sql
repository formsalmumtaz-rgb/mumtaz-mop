-- 083_service_report_question_set.sql
-- Vision Part 1: THE TEMPLATE'S FIELDS ARE THE SYSTEM'S QUESTION SET.
-- Everything here is SOURCED from docs/reference/AlMumtaz_ServiceReport_v2.pdf
-- (the real Mumtaz service report) unless marked ASSUMED. Additive only.

do $$
declare v_t uuid; v_sl uuid;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_t and code = 'pest_control';

  -- ── S4 premises types: complete the template's 14-entry list ─────────────
  insert into facility_types (tenant_id, service_line_id, code, name, is_assumed, assumed_note)
  select v_t, v_sl, x.code, x.name, false, 'SOURCED: AlMumtaz_ServiceReport_v2 S4'
    from (values
      ('labour_camp', 'Labour Camp'),
      ('ship_vessel_rig', 'Ship / Vessel / Rig'),
      ('mall_retail_complex', 'Mall / Retail Complex')
    ) as x(code, name)
   where not exists (select 1 from facility_types f where f.tenant_id = v_t and f.code = x.code);

  -- ── S5 pest activity evidence: the full checkbox list (SOURCED: template S5) ──
  insert into inspection_options (tenant_id, kind, code, label, is_assumed)
  select v_t, 'issue_type', x.code, x.label, false
    from (values
      ('bed_bug', 'Bed Bug'), ('mosquito', 'Mosquito'), ('flea', 'Flea'),
      ('termite', 'Termite'), ('scorpion', 'Scorpion'),
      ('stored_product_pest', 'Stored Product Pest'),
      ('bird_pigeon', 'Bird / Pigeon'), ('lizard_gecko', 'Lizard / Gecko'),
      ('no_activity', 'No Pest Activity Observed')
    ) as x(code, label)
   where not exists (select 1 from inspection_options o
                      where o.tenant_id = v_t and o.kind = 'issue_type' and o.code = x.code);

  -- infestation level gains 'Critical' (template scale: Low/Medium/High/Critical)
  insert into inspection_options (tenant_id, kind, code, label, is_assumed)
  select v_t, 'infestation', 'critical', 'Critical', false
   where not exists (select 1 from inspection_options o
                      where o.tenant_id = v_t and o.kind = 'infestation' and o.code = 'critical');

  -- ── S6 treatment areas: the full 15-entry list (SOURCED: template S6) ─────
  insert into inspection_options (tenant_id, kind, code, label, is_assumed)
  select v_t, 'area', x.code, x.label, false
    from (values
      ('dining_area', 'Dining Area'), ('store_room', 'Store Room'),
      ('bathroom_toilet', 'Bathroom / Toilet'), ('bedroom', 'Bedroom'),
      ('living_room', 'Living Room'), ('corridor_lobby', 'Corridor / Lobby'),
      ('basement_parking', 'Basement / Parking'), ('roof_terrace', 'Roof / Terrace'),
      ('garden_perimeter', 'Garden / Perimeter'), ('ac_ducts', 'AC Ducts'),
      ('drainage_sewage', 'Drainage / Sewage'), ('ceiling_void', 'Ceiling Void'),
      ('wall_cavities', 'Wall Cavities'), ('entire_premises', 'Entire Premises')
    ) as x(code, label)
   where not exists (select 1 from inspection_options o
                      where o.tenant_id = v_t and o.kind = 'area' and o.code = x.code);

  -- ── S7 treatment methods: complete the template's list ───────────────────
  insert into treatment_methods (tenant_id, service_line_id, code, name, is_assumed, assumed_note)
  select v_t, v_sl, x.code, x.name, false, 'SOURCED: AlMumtaz_ServiceReport_v2 S7'
    from (values
      ('gel_treatment', 'Gel Treatment'), ('spray_treatment', 'Spray Treatment'),
      ('residual_spray', 'Residual Spray'), ('fogging_ulv', 'Fogging / ULV'),
      ('termite_treatment', 'Termite Treatment'),
      ('rat_poison_bait_station', 'Rat Poison / Bait Station'),
      ('monitoring_only', 'Monitoring Only')
    ) as x(code, name)
   where not exists (select 1 from treatment_methods m
                      where m.tenant_id = v_t and m.code = x.code);

  -- ── S1/S2/S6/S7/S8 capture keys on the job (field app + office) ──────────
  insert into field_definitions (tenant_id, service_line_id, entity_type, field_key, label, data_type, is_required, enum_values, is_assumed)
  select v_t, null, 'job', x.k, x.l, x.dt, false, x.ev, false
    from (values
      ('service_order_type', 'Service order type', 'enum', array['scheduled','emergency','follow_up','warranty_visit']),
      ('treatment_method', 'Treatment method', 'text', null),
      ('onsite_rep_name', 'On-site representative name', 'text', null),
      ('onsite_rep_designation', 'Rep designation / department', 'text', null),
      ('onsite_rep_contact', 'Rep contact no.', 'text', null),
      ('specific_areas_treated', 'Specific areas / rooms treated (detail)', 'text', null),
      ('access_restrictions', 'Access restrictions / areas not treated', 'text', null),
      ('recommendations', 'Recommended corrective actions', 'text', null),
      ('ppe_used', 'PPE used by technician(s)', 'text', null)
    ) as x(k, l, dt, ev)
   where not exists (select 1 from field_definitions f
                      where f.tenant_id = v_t and f.service_line_id is null
                        and f.entity_type = 'job' and f.field_key = x.k);

  -- ── S7 chemical concentration on the item master (values unknown — NULL,
  --    never invented; owner fills from the product labels) ─────────────────
  alter table items add column if not exists concentration text;

  -- ── S11 guarantee months: company default, ASSUMED until owner confirms ──
  insert into settings (tenant_id, service_line_id, key, value, description, is_assumed)
  select v_t, v_sl, 'service.guarantee_months_default', to_jsonb(0::numeric),
         'Months guaranteed printed in S11 of the service report. 0 = omit. ASSUMED - set the real default.',
         true
   where not exists (select 1 from settings s where s.tenant_id = v_t and s.key = 'service.guarantee_months_default');
end $$;
