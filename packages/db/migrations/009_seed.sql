-- 009_seed.sql
-- MOP K1 — seed reference data. Real facts (company, service line, VAT rate,
-- standard units) are not flagged. Everything invented — the catalogues, team
-- and technician placeholders, the assumed AED currency — is flagged ASSUMED so
-- it renders with a warning badge until the owner confirms it (Art. X §4).

do $$
declare
  v_tenant uuid;
  v_sl     uuid;
begin
  -- real company + first service line (facts)
  insert into tenants(name) values ('Mumtaz Integrated Services Group')
    returning id into v_tenant;
  insert into service_lines(tenant_id, code, name)
    values (v_tenant, 'pest_control', 'Pest Control')
    returning id into v_sl;

  -- units (standard measurement facts)
  insert into units(tenant_id, service_line_id, code, name, dimension) values
    (v_tenant, v_sl, 'ml',   'Millilitre',   'volume'),
    (v_tenant, v_sl, 'l',    'Litre',        'volume'),
    (v_tenant, v_sl, 'g',    'Gram',         'mass'),
    (v_tenant, v_sl, 'kg',   'Kilogram',     'mass'),
    (v_tenant, v_sl, 'm2',   'Square metre', 'area'),
    (v_tenant, v_sl, 'each', 'Each',         'count');

  -- pricing models (ASSUMED — inferred from real contract data incl. "1200 EACH TREATMENT")
  insert into pricing_models(tenant_id, service_line_id, code, name, description, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'fixed_period',  'Fixed periodic', 'Fixed fee per contract period (e.g. annual AMC)', true, 'Inferred from contract data — confirm'),
    (v_tenant, v_sl, 'per_treatment', 'Per treatment',  'Charged per treatment/visit',                     true, 'Inferred from "EACH TREATMENT" contracts — confirm');

  -- frequencies (labels sourced from contracts; the period/visit spec is inferred)
  insert into frequencies(tenant_id, service_line_id, code, name, period_unit, period_count, visits_per_period, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'monthly_1',  'Monthly - 1 visit',           'month', 1, 1, true, 'Spec inferred from label — confirm'),
    (v_tenant, v_sl, 'monthly_2',  'Monthly - 2 visits',          'month', 1, 2, true, 'Spec inferred from label — confirm'),
    (v_tenant, v_sl, 'bimonthly',  'Bi-monthly (every 2 months)', 'month', 2, 1, true, 'Spec inferred from label — confirm');

  -- service types (ASSUMED standard pest-control set)
  insert into service_types(tenant_id, service_line_id, code, name, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'general_pest', 'General Pest Control', true, 'Standard set — confirm'),
    (v_tenant, v_sl, 'cockroach',    'Cockroach Treatment',  true, 'Standard set — confirm'),
    (v_tenant, v_sl, 'rodent',       'Rodent Control',       true, 'Standard set — confirm'),
    (v_tenant, v_sl, 'bed_bug',      'Bed Bug Treatment',    true, 'Standard set — confirm'),
    (v_tenant, v_sl, 'termite',      'Termite Treatment',    true, 'Standard set — confirm'),
    (v_tenant, v_sl, 'fogging',      'Fogging',              true, 'Standard set — confirm');

  -- job types (ASSUMED)
  insert into job_types(tenant_id, service_line_id, code, name, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'routine_visit',     'Routine Visit',     true, 'Confirm'),
    (v_tenant, v_sl, 'initial_treatment', 'Initial Treatment', true, 'Confirm'),
    (v_tenant, v_sl, 'callback',          'Callback / Complaint', true, 'Confirm');

  -- pest types (ASSUMED)
  insert into pest_types(tenant_id, service_line_id, code, name, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'cockroach', 'Cockroach', true, 'Confirm'),
    (v_tenant, v_sl, 'rodent',    'Rodent',    true, 'Confirm'),
    (v_tenant, v_sl, 'bed_bug',   'Bed Bug',   true, 'Confirm'),
    (v_tenant, v_sl, 'ant',       'Ant',       true, 'Confirm'),
    (v_tenant, v_sl, 'termite',   'Termite',   true, 'Confirm'),
    (v_tenant, v_sl, 'mosquito',  'Mosquito',  true, 'Confirm'),
    (v_tenant, v_sl, 'fly',       'Fly',       true, 'Confirm');

  -- treatment methods (ASSUMED)
  insert into treatment_methods(tenant_id, service_line_id, code, name, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'residual_spray', 'Residual Spray',       true, 'Confirm'),
    (v_tenant, v_sl, 'gel_bait',       'Gel Bait',             true, 'Confirm'),
    (v_tenant, v_sl, 'glue_board',     'Glue Board Placement', true, 'Confirm'),
    (v_tenant, v_sl, 'bait_station',   'Bait Station',         true, 'Confirm'),
    (v_tenant, v_sl, 'fogging',        'Fogging',              true, 'Confirm');

  -- facility types (ASSUMED; drives the Phase-2 agreement generator's form schema)
  insert into facility_types(tenant_id, service_line_id, code, name, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'restaurant', 'Restaurant',       true, 'Confirm'),
    (v_tenant, v_sl, 'villa',      'Villa',            true, 'Confirm'),
    (v_tenant, v_sl, 'apartment',  'Apartment',        true, 'Confirm'),
    (v_tenant, v_sl, 'warehouse',  'Warehouse',        true, 'Confirm'),
    (v_tenant, v_sl, 'office',     'Office',           true, 'Confirm'),
    (v_tenant, v_sl, 'factory',    'Factory',          true, 'Confirm'),
    (v_tenant, v_sl, 'clinic',     'Clinic / Medical', true, 'Confirm');

  -- 2 teams (ASSUMED placeholders — owner enters real names in the admin console)
  insert into teams(tenant_id, service_line_id, code, name, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'team_a', 'Team A (placeholder)', true, 'Placeholder — enter the real team name'),
    (v_tenant, v_sl, 'team_b', 'Team B (placeholder)', true, 'Placeholder — enter the real team name');

  -- 10 technicians (ASSUMED placeholders)
  insert into technicians(tenant_id, service_line_id, code, full_name, is_assumed, assumed_note)
  select v_tenant, v_sl,
         'tech_' || lpad(g::text, 2, '0'),
         'Technician ' || lpad(g::text, 2, '0'),
         true, 'Placeholder — enter the real technician name'
  from generate_series(1, 10) g;

  -- settings (settings has is_assumed but no assumed_note column)
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, v_sl,  'default_currency',  '"AED"'::jsonb, 'Default currency for money fields (assumed AED; source data unlabelled)', true),
    (v_tenant, null,  'vat_rate_percent',  '5'::jsonb,     'UAE standard VAT rate (%)',                                                false);
end $$;
