-- 061_material_landed_costs.sql
-- Costing engine - real configuration, part 2 of 3 (materials).
-- Creates the three pest chemicals the costing model uses and seeds each with a
-- goods-receipt landed cost so fn_item_standard_cost derives a real per-unit cost
-- (Constitution: material cost comes from landed cost, never a typed rate).
--
--   Blitz Residual Spray  100 AED / 1 L   -> 0.10 AED/ml   (real, owner)
--   Pro Surfactant        price UNKNOWN   -> ASSUMED 0.05 AED/ml (flagged; BLOCKED A13)
--   Gel Bait              40 AED / 30 g   -> 1.3333 AED/g   (real, owner)
--
-- item_purchases carries only an append-only guard (no auto GL/stock posting), so
-- these are pure landed-cost reference receipts (no batch/journal/stock movement) -
-- honest seed data, idempotent by reference_no. No structural invariant touched.

do $$
declare
  v_tenant uuid; v_sl uuid;
  u_ml uuid; u_l uuid; u_g uuid;
  i_blitz uuid; i_surf uuid; i_gel uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';
  select id into u_ml from units where tenant_id = v_tenant and code = 'ml';
  select id into u_l  from units where tenant_id = v_tenant and code = 'l';
  select id into u_g  from units where tenant_id = v_tenant and code = 'g';

  -- ── Items (idempotent by code) ──────────────────────────────────────────────
  insert into items(tenant_id, service_line_id, code, name, item_type, base_unit_id, is_assumed, assumed_note, active_ingredient)
  values (v_tenant, v_sl, 'CHEM_BLITZ_RS', 'Blitz Residual Spray', 'chemical', u_ml, false, null, 'residual insecticide')
  on conflict (tenant_id, code) do update set name = excluded.name, base_unit_id = excluded.base_unit_id
  returning id into i_blitz;
  if i_blitz is null then select id into i_blitz from items where tenant_id = v_tenant and code = 'CHEM_BLITZ_RS'; end if;

  insert into items(tenant_id, service_line_id, code, name, item_type, base_unit_id, is_assumed, assumed_note, active_ingredient)
  values (v_tenant, v_sl, 'CHEM_PRO_SURF', 'Pro Surfactant', 'chemical', u_ml, true,
          'Landed cost UNKNOWN - seeded ASSUMED 0.05 AED/ml (50 AED/L). Confirm real price (BLOCKED A13).', 'surfactant/wetting agent')
  on conflict (tenant_id, code) do update set name = excluded.name, base_unit_id = excluded.base_unit_id, is_assumed = true
  returning id into i_surf;
  if i_surf is null then select id into i_surf from items where tenant_id = v_tenant and code = 'CHEM_PRO_SURF'; end if;

  insert into items(tenant_id, service_line_id, code, name, item_type, base_unit_id, is_assumed, assumed_note, active_ingredient)
  values (v_tenant, v_sl, 'CHEM_GEL_BAIT', 'Gel Bait', 'chemical', u_g, false, null, 'cockroach gel bait')
  on conflict (tenant_id, code) do update set name = excluded.name, base_unit_id = excluded.base_unit_id
  returning id into i_gel;
  if i_gel is null then select id into i_gel from items where tenant_id = v_tenant and code = 'CHEM_GEL_BAIT'; end if;

  -- ── Landed-cost goods receipts (idempotent by reference_no) ──────────────────
  -- Blitz: 1 L pack = 1000 ml, 100 AED  -> unit_cost 0.10/ml
  if not exists (select 1 from item_purchases where tenant_id = v_tenant and item_id = i_blitz and reference_no = 'SEED-LANDED-061') then
    insert into item_purchases(tenant_id, service_line_id, item_id, purchase_date, pack_quantity, pack_size, pack_unit_id,
                               base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no, snapshot)
    values (v_tenant, v_sl, i_blitz, current_date, 1, 1, u_l, u_ml, 1000, 100, 'AED', 'payable', 'SEED-LANDED-061',
            jsonb_build_object('seed', true, 'basis', '100 AED per 1 L', 'note', 'owner 2026-08-12 landed-cost reference'));
  end if;

  -- Pro Surfactant: ASSUMED 50 AED / 1 L -> 0.05/ml
  if not exists (select 1 from item_purchases where tenant_id = v_tenant and item_id = i_surf and reference_no = 'SEED-LANDED-061') then
    insert into item_purchases(tenant_id, service_line_id, item_id, purchase_date, pack_quantity, pack_size, pack_unit_id,
                               base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no, snapshot)
    values (v_tenant, v_sl, i_surf, current_date, 1, 1, u_l, u_ml, 1000, 50, 'AED', 'payable', 'SEED-LANDED-061',
            jsonb_build_object('seed', true, 'assumed', true, 'basis', 'ASSUMED 50 AED per 1 L - price unknown', 'note', 'BLOCKED A13: confirm real Pro Surfactant landed cost'));
  end if;

  -- Gel Bait: 1 tube = 30 g, 40 AED -> 1.3333/g
  if not exists (select 1 from item_purchases where tenant_id = v_tenant and item_id = i_gel and reference_no = 'SEED-LANDED-061') then
    insert into item_purchases(tenant_id, service_line_id, item_id, purchase_date, pack_quantity, pack_size, pack_unit_id,
                               base_unit_id, total_base_quantity, total_cost, currency, payment_mode, reference_no, snapshot)
    values (v_tenant, v_sl, i_gel, current_date, 1, 30, u_g, u_g, 30, 40, 'AED', 'payable', 'SEED-LANDED-061',
            jsonb_build_object('seed', true, 'basis', '40 AED per 30 g tube', 'note', 'owner 2026-08-12 landed-cost reference'));
  end if;

  raise notice '061 applied: Blitz=% Surfactant=% Gel=%',
    fn_item_standard_cost(v_tenant, i_blitz), fn_item_standard_cost(v_tenant, i_surf), fn_item_standard_cost(v_tenant, i_gel);
end $$;
