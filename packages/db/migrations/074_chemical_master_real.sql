-- 074_chemical_master_real.sql
-- Chemical master — REAL data from the owner's CHEMICAL_LIST (13 Aug 2026),
-- replacing the ASSUMED seeds of mig 061/062. Prices are EX-VAT; landed cost =
-- price + 5% VAT + apportioned delivery and comes from goods receipts — where no
-- rate exists the cost stays BLANK and flagged (never invented, Art. X §4).
--
-- Corrections (item_purchases is APPEND-ONLY, so corrections are NEW superseding
-- receipts — fn_item_standard_cost takes the latest; the wrong seed receipts stay
-- as history, exactly as the doctrine requires):
--   Blitz          85/L ex-VAT  → 0.085/ml   (was wrongly 0.10)
--   Pro Surfactant 40/100ml     → 0.40/ml, dose 5 ml (was wrongly 0.05/ml @10ml)
--   Power Gel      40/35g tube  → 1.1429/g   (was wrongly "Gel Bait" 40/30g)
--
-- SERVICE TYPE vs TREATMENT METHOD: service types are what the customer buys
-- (General Pest Control / Termite / Bedbug / Rodent — each with own recipes,
-- pricing, frequency); treatment methods (spray/gel/bait) are how a visit is
-- executed WITHIN a service type. The alternating cycle lives at method level
-- inside General Pest Control. Chemicals link to service types via
-- items.intended_service_type_ids; substitution happens within a group
-- (items.substitution_group) so recipes say "a GPC spray concentrate at 50 ml"
-- and stock decides the product.

alter table items add column if not exists substitution_group text;

do $$
declare
  v_t uuid; v_sl uuid;
  u_ml uuid; u_l uuid; u_g uuid; u_kg uuid; u_each uuid;
  st_gpc uuid; st_term uuid; st_bed uuid; st_rod uuid;
  i uuid;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_t and code = 'pest_control';
  select id into u_ml from units where tenant_id = v_t and code = 'ml';
  select id into u_l  from units where tenant_id = v_t and code = 'l';
  select id into u_g  from units where tenant_id = v_t and code = 'g';
  select id into u_kg from units where tenant_id = v_t and code = 'kg';
  select id into u_each from units where tenant_id = v_t and code = 'each';
  select id into st_gpc  from service_types where tenant_id = v_t and code = 'general_pest';
  select id into st_term from service_types where tenant_id = v_t and code = 'termite';
  select id into st_bed  from service_types where tenant_id = v_t and code = 'bed_bug';
  select id into st_rod  from service_types where tenant_id = v_t and code = 'rodent';

  -- helper pattern: upsert item by code, then (if a rate exists) append a
  -- superseding landed-cost reference receipt (ex-VAT price + 5% VAT; delivery 0
  -- until a real GRN supplies it — noted in the snapshot).

  -- ── General Pest Control ──
  update items set name='Blitz Residual Spray', substitution_group='gpc_spray_concentrate',
         intended_service_type_ids=array[st_gpc], is_assumed=false, assumed_note=null
   where tenant_id=v_t and code='CHEM_BLITZ_RS' returning id into i;
  insert into item_purchases (tenant_id, service_line_id, item_id, purchase_date, pack_quantity, pack_size, pack_unit_id,
                              base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no, snapshot)
  values (v_t, v_sl, i, current_date, 1, 1, u_l, u_ml, 1000, 89.25, 'AED', 'payable', 'CHEM-LIST-074',
          jsonb_build_object('basis','85 AED/L ex-VAT +5% VAT; delivery 0 until real GRN','list','CHEMICAL_LIST 13 Aug 2026'));

  insert into items (tenant_id, service_line_id, code, name, item_type, base_unit_id, substitution_group,
                     intended_service_type_ids, is_assumed, assumed_note)
  values (v_t, v_sl, 'CHEM_FENDONA', 'Fendona', 'chemical', u_ml, 'gpc_spray_concentrate', array[st_gpc], false,
          'No rate on the list - cost stays blank until a real goods receipt. FLAGGED.')
  on conflict (tenant_id, code) do update set substitution_group='gpc_spray_concentrate';

  update items set name='Power Gel', substitution_group='gpc_gel_bait',
         intended_service_type_ids=array[st_gpc], is_assumed=false, assumed_note=null
   where tenant_id=v_t and code='CHEM_GEL_BAIT' returning id into i;
  insert into item_purchases (tenant_id, service_line_id, item_id, purchase_date, pack_quantity, pack_size, pack_unit_id,
                              base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no, snapshot)
  values (v_t, v_sl, i, current_date, 1, 35, u_g, u_g, 35, 42.00, 'AED', 'payable', 'CHEM-LIST-074',
          jsonb_build_object('basis','40 AED/35g tube ex-VAT +5% VAT','list','CHEMICAL_LIST 13 Aug 2026'));

  insert into items (tenant_id, service_line_id, code, name, item_type, base_unit_id, substitution_group,
                     intended_service_type_ids, is_assumed)
  values (v_t, v_sl, 'CHEM_TOPBAITMAX', 'Top Bait Max', 'chemical', u_g, 'gpc_gel_bait', array[st_gpc], false)
  on conflict (tenant_id, code) do nothing returning id into i;
  if i is null then select id into i from items where tenant_id=v_t and code='CHEM_TOPBAITMAX'; end if;
  insert into item_purchases (tenant_id, service_line_id, item_id, purchase_date, pack_quantity, pack_size, pack_unit_id,
                              base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no, snapshot)
  values (v_t, v_sl, i, current_date, 1, 35, u_g, u_g, 35, 37.80, 'AED', 'payable', 'CHEM-LIST-074',
          jsonb_build_object('basis','36 AED/35g ex-VAT +5% VAT','list','CHEMICAL_LIST 13 Aug 2026'));

  update items set name='Pro Surfactant', substitution_group='gpc_surfactant',
         intended_service_type_ids=array[st_gpc], is_assumed=false, assumed_note=null
   where tenant_id=v_t and code='CHEM_PRO_SURF' returning id into i;
  insert into item_purchases (tenant_id, service_line_id, item_id, purchase_date, pack_quantity, pack_size, pack_unit_id,
                              base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no, snapshot)
  values (v_t, v_sl, i, current_date, 1, 100, u_ml, u_ml, 100, 42.00, 'AED', 'payable', 'CHEM-LIST-074',
          jsonb_build_object('basis','40 AED/100ml ex-VAT +5% VAT; REAL price replacing ASSUMED 0.05/ml','list','CHEMICAL_LIST 13 Aug 2026'));

  insert into items (tenant_id, service_line_id, code, name, item_type, base_unit_id, substitution_group,
                     intended_service_type_ids, is_active, is_assumed, assumed_note)
  values (v_t, v_sl, 'CHEM_ALPHASUPER', 'Alpha Super', 'chemical', u_ml, 'gpc_spray_concentrate', array[st_gpc], false, false,
          'DISCONTINUED (NOT ACTIVE) - kept for historical batch traceability, excluded from selection.')
  on conflict (tenant_id, code) do update set is_active=false returning id into i;
  if i is null then select id into i from items where tenant_id=v_t and code='CHEM_ALPHASUPER'; end if;
  insert into item_purchases (tenant_id, service_line_id, item_id, purchase_date, pack_quantity, pack_size, pack_unit_id,
                              base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no, snapshot)
  values (v_t, v_sl, i, current_date, 1, 1, u_l, u_ml, 1000, 105.00, 'AED', 'payable', 'CHEM-LIST-074',
          jsonb_build_object('basis','100 AED/L ex-VAT +5% VAT (historical)','list','CHEMICAL_LIST 13 Aug 2026'));

  -- ── Termite / Bedbug / Rodent ──
  insert into items (tenant_id, service_line_id, code, name, item_type, base_unit_id, substitution_group,
                     intended_service_type_ids, is_assumed, assumed_note)
  values (v_t, v_sl, 'CHEM_SPECTRUM', 'Spectrum', 'chemical', u_ml, 'termite_concentrate', array[st_term], false,
          'No rate on the list - cost blank until a real goods receipt. FLAGGED.')
  on conflict (tenant_id, code) do nothing;

  insert into items (tenant_id, service_line_id, code, name, item_type, base_unit_id, substitution_group,
                     intended_service_type_ids, is_assumed)
  values (v_t, v_sl, 'CHEM_TANDOM', 'Tandom', 'chemical', u_ml, 'bedbug_concentrate', array[st_bed], false)
  on conflict (tenant_id, code) do nothing returning id into i;
  if i is null then select id into i from items where tenant_id=v_t and code='CHEM_TANDOM'; end if;
  insert into item_purchases (tenant_id, service_line_id, item_id, purchase_date, pack_quantity, pack_size, pack_unit_id,
                              base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no, snapshot)
  values (v_t, v_sl, i, current_date, 1, 100, u_ml, u_ml, 100, 84.00, 'AED', 'payable', 'CHEM-LIST-074',
          jsonb_build_object('basis','80 AED/100ml ex-VAT +5% VAT','list','CHEMICAL_LIST 13 Aug 2026'));

  insert into items (tenant_id, service_line_id, code, name, item_type, base_unit_id, substitution_group,
                     intended_service_type_ids, is_assumed)
  values (v_t, v_sl, 'CHEM_BROMA', 'Broma', 'chemical', u_g, 'rodent_bait', array[st_rod], false)
  on conflict (tenant_id, code) do nothing returning id into i;
  if i is null then select id into i from items where tenant_id=v_t and code='CHEM_BROMA'; end if;
  insert into item_purchases (tenant_id, service_line_id, item_id, purchase_date, pack_quantity, pack_size, pack_unit_id,
                              base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no, snapshot)
  values (v_t, v_sl, i, current_date, 1, 1, u_kg, u_g, 1000, 47.25, 'AED', 'payable', 'CHEM-LIST-074',
          jsonb_build_object('basis','45 AED/kg ex-VAT +5% VAT','list','CHEMICAL_LIST 13 Aug 2026'));

  insert into items (tenant_id, service_line_id, code, name, item_type, base_unit_id, substitution_group,
                     intended_service_type_ids, is_assumed, assumed_note)
  values (v_t, v_sl, 'CHEM_PASTA', 'Pasta', 'chemical', u_g, 'rodent_bait', array[st_rod], false,
          'No rate on the list - cost blank until a real goods receipt. FLAGGED.')
  on conflict (tenant_id, code) do nothing;

  insert into items (tenant_id, service_line_id, code, name, item_type, base_unit_id, substitution_group,
                     intended_service_type_ids, is_assumed)
  values (v_t, v_sl, 'CONS_GLUETRAP', 'Glue Trap', 'consumable', u_each, 'rodent_trap', array[st_rod], false)
  on conflict (tenant_id, code) do nothing returning id into i;
  if i is null then select id into i from items where tenant_id=v_t and code='CONS_GLUETRAP'; end if;
  insert into item_purchases (tenant_id, service_line_id, item_id, purchase_date, pack_quantity, pack_size, pack_unit_id,
                              base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no, snapshot)
  values (v_t, v_sl, i, current_date, 1, 1, u_each, u_each, 1, 8.40, 'AED', 'payable', 'CHEM-LIST-074',
          jsonb_build_object('basis','8 AED/pc ex-VAT +5% VAT','list','CHEMICAL_LIST 13 Aug 2026'));

  -- "Sprayer" 10L: equipment (the sprayer tank), not a chemical — flagged to owner.
  insert into items (tenant_id, service_line_id, code, name, item_type, base_unit_id,
                     intended_service_type_ids, is_assumed, assumed_note)
  values (v_t, v_sl, 'EQUIP_SPRAYER10L', 'Pest Control Sprayer (10 L)', 'equipment', u_each, array[st_gpc], true,
          'FLAG: source row "Sprayer / 10 L / spray purpose / no rate" read as the 10-litre sprayer tank (equipment), not a chemical - owner to confirm.')
  on conflict (tenant_id, code) do nothing;

  -- ── Consumption corrections (mig 062 rates) ──
  -- surfactant: dose 5 ml per 10L tank covering ~200 m² → 0.025 ml/m² (was 0.05)
  update treatment_visit_consumption c set qty_per_m2 = 0.025,
         assumed_note = 'DERIVED: 5 ml Pro Surfactant per 10L tank over ~200 m2 (dose corrected 13 Aug). Area basis still assumed.'
    from items it where it.id = c.item_id and c.tenant_id = v_t and it.code = 'CHEM_PRO_SURF';
  -- gel: 30% of a 35 g tube = 10.5 g per ~100 m² 2BHK → 0.105 g/m² (was 0.09)
  update treatment_visit_consumption c set qty_per_m2 = 0.105,
         assumed_note = 'DERIVED: 10.5 g (30% of 35 g tube) covers a ~100 m2 2BHK (corrected 13 Aug). Estimate by area; actuals self-correct.'
    from items it where it.id = c.item_id and c.tenant_id = v_t and it.code = 'CHEM_GEL_BAIT';

  -- ── Recipes per service type (real doses; coverage ASSUMED where inferred) ──
  insert into treatment_recipes (tenant_id, service_line_id, code, name, is_assumed, assumed_note) values
    (v_t, v_sl, 'termite_spectrum', 'Termite Treatment — Spectrum', true, 'Coverage/application volume to confirm'),
    (v_t, v_sl, 'bedbug_tandom',    'Bedbug Treatment — Tandom',    true, 'Coverage to confirm'),
    (v_t, v_sl, 'rodent_baiting',   'Rodent Control — bait + traps', true, 'Stations per area to confirm')
  on conflict (tenant_id, service_line_id, code) do nothing;

  insert into treatment_recipe_versions (recipe_id, version_no, effective_from, dose_rate, dose_unit_id, dilution_ratio, notes, is_assumed, source_ref)
  select r.id, 1, current_date, x.dose, u_ml, x.dil, x.note, true, 'CHEMICAL_LIST 13 Aug 2026'
    from treatment_recipes r
    join (values
      ('termite_spectrum', 40::numeric, '~40 ml per 10 L', 'Spectrum concentrate ~40 ml per tank; substitution group termite_concentrate. COVERAGE ASSUMED - confirm.'),
      ('bedbug_tandom',     5::numeric, '5 ml per 1 L',    'Tandom 5 ml dose; substitution group bedbug_concentrate. COVERAGE ASSUMED - confirm.'),
      ('rodent_baiting',  null::numeric, null,             'Broma/Pasta (rodent_bait group) per station + Glue Traps per area. RATES PER AREA ASSUMED - confirm.')
    ) as x(code, dose, dil, note) on x.code = r.code
   where r.tenant_id = v_t
     and not exists (select 1 from treatment_recipe_versions v where v.recipe_id = r.id);
end $$;
