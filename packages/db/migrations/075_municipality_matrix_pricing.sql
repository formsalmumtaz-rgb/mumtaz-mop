-- 075_municipality_matrix_pricing.sql
-- (a) The five official Sharjah Municipality contract categories + mapping from
--     our facility types. SOURCE: Sharjah Municipality Unified Contract templates
--     (docs/compliance/, filed 13 Aug 2026).
-- (b) Frequency matrix per Unified Contract CLAUSE 5 — SOURCED, replacing the
--     owner-assumed seeds of mig 073. Mosquito control is 24/yr in EVERY category.
-- (c) Pricing: default target margin 70% (owner-set) + four real reference rates.

create table if not exists municipality_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  code        text not null,
  name        text not null,
  description text,
  source      text,
  unique (tenant_id, code)
);
alter table municipality_categories enable row level security;
drop policy if exists tenant_isolation on municipality_categories;
create policy tenant_isolation on municipality_categories
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on municipality_categories to mop_app;

alter table facility_types add column if not exists municipality_category_id uuid references municipality_categories(id);

do $$
declare
  v_t uuid; v_sl uuid; v_src text;
  mc1 uuid; mc2 uuid; mc3 uuid; mc4 uuid; mc5 uuid;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_t and code = 'pest_control';
  v_src := 'Sharjah Municipality Unified Contract, clause 5 (docs/compliance/, filed 13 Aug 2026)';

  insert into municipality_categories (tenant_id, code, name, description, source) values
    (v_t, 'foodstuffs',   '1. Foodstuffs Facilities', 'Restaurants, cafés, supermarkets, food processing', v_src),
    (v_t, 'res_trading',  '2. Residential & Trading Facilities', 'Villas, apartments, offices, retail, warehouses', v_src),
    (v_t, 'edu_worship',  '3. Educational Facilities & Places of Worship', 'Schools, nurseries, mosques', v_src),
    (v_t, 'health',       '4. Health & Medical Centres', 'Clinics, hospitals, pharmacies, labs', v_src),
    (v_t, 'restrictive',  '5. Restrictive Contract', 'Construction sites, termite pre-treatment. Contract runs until the Building Completion Certificate issues; min 3 termite treatments in non-infested areas; attestation BEFORE treatment.', v_src)
  on conflict (tenant_id, code) do nothing;
  select id into mc1 from municipality_categories where tenant_id=v_t and code='foodstuffs';
  select id into mc2 from municipality_categories where tenant_id=v_t and code='res_trading';
  select id into mc3 from municipality_categories where tenant_id=v_t and code='edu_worship';
  select id into mc4 from municipality_categories where tenant_id=v_t and code='health';
  select id into mc5 from municipality_categories where tenant_id=v_t and code='restrictive';

  -- map existing facility types; factory FLAGGED (could be foodstuffs if food processing)
  update facility_types set municipality_category_id = mc1 where tenant_id=v_t and code = 'restaurant';
  update facility_types set municipality_category_id = mc2 where tenant_id=v_t and code in ('apartment','villa','office','warehouse');
  update facility_types set municipality_category_id = mc4 where tenant_id=v_t and code = 'clinic';
  update facility_types set municipality_category_id = mc2, is_assumed = true,
         assumed_note = 'FLAG: mapped to Residential & Trading - a FOOD factory belongs to Foodstuffs. Owner to confirm per customer.'
   where tenant_id=v_t and code = 'factory';
  -- add the missing municipality-relevant premises (ASSUMED additions)
  insert into facility_types (tenant_id, service_line_id, code, name, municipality_category_id, is_assumed, assumed_note)
  select v_t, v_sl, x.c, x.n, x.mc, true, x.note
    from (values
      ('school',       'School / Nursery',           null::uuid, 'Added for municipality category 3 - confirm'),
      ('mosque',       'Mosque / Worship',           null::uuid, 'Added for municipality category 3 - confirm'),
      ('supermarket',  'Supermarket / Food retail',  null::uuid, 'Added for municipality category 1 - confirm'),
      ('construction', 'Construction site',          null::uuid, 'Added for municipality category 5 (Restrictive) - confirm')
    ) as x(c, n, mc, note)
   where not exists (select 1 from facility_types f where f.tenant_id = v_t and f.code = x.c);
  update facility_types set municipality_category_id = mc3 where tenant_id=v_t and code in ('school','mosque') and municipality_category_id is null;
  update facility_types set municipality_category_id = mc1 where tenant_id=v_t and code = 'supermarket' and municipality_category_id is null;
  update facility_types set municipality_category_id = mc5 where tenant_id=v_t and code = 'construction' and municipality_category_id is null;

  -- ── clause-5 frequency matrix, SOURCED, per mapped facility type ──
  -- wipe the owner-assumed 073 seeds for Sharjah and reseed from the source
  delete from compliance_visit_frequencies where tenant_id = v_t and emirate = 'Sharjah';
  insert into compliance_visit_frequencies
    (tenant_id, service_line_id, emirate, facility_type_id, target_pest_group, visits_per_year, source, is_assumed)
  select v_t, v_sl, 'Sharjah', ft.id, x.pest, x.n, v_src, false
    from facility_types ft
    join (values
      ('foodstuffs',  'general',  24), ('foodstuffs',  'mosquito', 24),
      ('res_trading', 'general',  12), ('res_trading', 'mosquito', 24),
      ('edu_worship', 'general',  12), ('edu_worship', 'mosquito', 24),
      ('health',      'general',  12), ('health',      'mosquito', 24),
      ('restrictive', 'general',  12), ('restrictive', 'termite',   3)
    ) as x(cat, pest, n) on true
    join municipality_categories mc on mc.id = ft.municipality_category_id and mc.tenant_id = v_t and mc.code = x.cat
   where ft.tenant_id = v_t
  on conflict do nothing;
  -- restrictive detail: 12-24 range general; termite row = the MINIMUM 3 treatments
  update compliance_visit_frequencies f set assumed_note = 'Clause 5 range is 12-24/yr (1-2 monthly) for Restrictive; 12 seeded as the floor. Termite row = minimum 3 treatments in non-infested areas; contract runs until Building Completion Certificate.'
    from facility_types ft
   where f.facility_type_id = ft.id and ft.code = 'construction' and f.tenant_id = v_t;

  -- ── pricing: owner-set 70% target margin + four real reference rates ──
  update settings set value = to_jsonb(0.70::numeric), is_assumed = false, confirmed_at = now(),
         description = 'Default target gross margin (owner-set 13 Aug 2026). Editable.'
   where tenant_id = v_t and key = 'cost.target_margin_default';
  insert into settings (tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_t, v_sl, 'pricing.reference_rates',
     '[{"label":"AMC 1330/25","aed":100},{"label":"Sharjah AMC 1236/26","aed":147},{"label":"Ad-hoc","aed":250},{"label":"Dubai AMC 1235/26","aed":262.5}]'::jsonb,
     'Real per-treatment reference rates for comparable restaurant work (owner, 13 Aug 2026). Dubai is 79% above Sharjah for the same service - FLAGGED for owner review (market vs travel vs inconsistency).', false)
  on conflict (tenant_id, service_line_id, key) do update set value = excluded.value, description = excluded.description, is_assumed = false;
end $$;
