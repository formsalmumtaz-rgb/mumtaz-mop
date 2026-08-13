-- 073_premises_compliance_rules.sql
-- Premises-category compliance rules (Sharjah Municipality medical-facility
-- requirements — source: docs/compliance/sharjah-medical-facility-pest-contract-
-- requirements-ar.pdf, filed 13 Aug 2026; ROADMAP §8 / DOCUMENT 10).
--
-- THE FIX: visit frequency is NOT one number. It is a function of premises
-- category AND target pest: Sharjah F&B general = 24/yr, Sharjah MEDICAL general
-- = 12/yr, Sharjah MEDICAL mosquito = 24/yr. Restructured as reference data
-- keyed on (emirate, facility_type, pest group), seeded from what is known,
-- ASSUMED where the source is not yet in hand, editable — one default is never
-- again presented as "the municipality rule" (Art. X §4).
--
-- Also: per-category contract clauses (same pattern as division branding —
-- reference data the agreement generator reads, not code), per-category
-- scheduling constraints (medical = night by REGULATION; 24h institutions =
-- 00:00–03:00 hard window), and per-category chemical approval (EDE registration
-- + MSDS as chemical attributes; a restaurant-acceptable product may fail the
-- medical criteria).
--
-- All new tables: tenant_id + RLS tenant_isolation + mop_app grants. Editable
-- reference data; no structural invariant touched.

-- ── 1. Visit frequency = f(emirate, premises category, target pest) ─────────
create table if not exists compliance_visit_frequencies (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  service_line_id  uuid references service_lines(id),
  emirate          text,                              -- null = any emirate
  facility_type_id uuid references facility_types(id),-- null = any premises
  target_pest_group text not null check (target_pest_group in
                     ('general','crawling','flying','mosquito','rodent','termite','other')),
  visits_per_year  int not null check (visits_per_year > 0),
  source           text,                              -- which regulation says so
  is_assumed       boolean not null default false,
  assumed_note     text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(), created_by uuid,
  updated_at       timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, emirate, facility_type_id, target_pest_group)
);
alter table compliance_visit_frequencies enable row level security;
drop policy if exists tenant_isolation on compliance_visit_frequencies;
create policy tenant_isolation on compliance_visit_frequencies
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on compliance_visit_frequencies to mop_app;

-- Lookup with sensible fallback: exact (emirate+facility) → facility any-emirate
-- → emirate any-facility → global. Returns null when nothing is configured — the
-- caller must ask, never invent.
create or replace function fn_visit_frequency(
  p_tenant uuid, p_service_line uuid, p_emirate text, p_facility_type uuid, p_pest_group text default 'general'
) returns int language sql stable as $$
  select visits_per_year from compliance_visit_frequencies
   where tenant_id = p_tenant and is_active
     and (service_line_id = p_service_line or service_line_id is null)
     and target_pest_group = p_pest_group
     and (emirate is null or emirate = p_emirate)
     and (facility_type_id is null or facility_type_id = p_facility_type)
   order by (facility_type_id is not null) desc, (emirate is not null) desc,
            (service_line_id is not null) desc
   limit 1;
$$;
grant execute on function fn_visit_frequency(uuid, uuid, text, uuid, text) to mop_app;

-- ── 2. Per-category contract clauses (agreement generator content) ──────────
create table if not exists contract_clause_templates (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  service_line_id  uuid references service_lines(id),
  facility_type_id uuid references facility_types(id), -- null = every agreement
  emirate          text,                               -- null = any emirate
  clause_key       text not null,
  heading          text not null,
  body             text not null,
  sort_order       int not null default 100,
  is_required      boolean not null default true,
  is_active        boolean not null default true,
  is_assumed       boolean not null default false,
  assumed_note     text,
  source_ref       text,
  created_at       timestamptz not null default now(), created_by uuid,
  updated_at       timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, facility_type_id, emirate, clause_key)
);
alter table contract_clause_templates enable row level security;
drop policy if exists tenant_isolation on contract_clause_templates;
create policy tenant_isolation on contract_clause_templates
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on contract_clause_templates to mop_app;

-- ── 3. Per-category scheduling constraints (regulatory, not preference) ─────
create table if not exists compliance_scheduling_rules (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  service_line_id  uuid references service_lines(id),
  emirate          text,
  facility_type_id uuid references facility_types(id),
  applies_when     text,                               -- e.g. '24-hour institutions'
  force_night      boolean not null default false,
  window_start     time,                               -- hard treatment window
  window_end       time,
  note             text,
  is_assumed       boolean not null default false,
  assumed_note     text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(), created_by uuid,
  updated_at       timestamptz not null default now(), updated_by uuid
);
alter table compliance_scheduling_rules enable row level security;
drop policy if exists tenant_isolation on compliance_scheduling_rules;
create policy tenant_isolation on compliance_scheduling_rules
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on compliance_scheduling_rules to mop_app;

-- ── 4. Per-category chemical approval (EDE registration + criteria) ─────────
alter table items add column if not exists ede_registration_no text;  -- msds_ref exists (mig 007)

create table if not exists item_premises_approvals (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  item_id          uuid not null references items(id),
  facility_type_id uuid not null references facility_types(id),
  is_approved      boolean not null default false,
  criteria_note    text,
  is_assumed       boolean not null default false,
  assumed_note     text,
  created_at       timestamptz not null default now(), created_by uuid,
  updated_at       timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, item_id, facility_type_id)
);
alter table item_premises_approvals enable row level security;
drop policy if exists tenant_isolation on item_premises_approvals;
create policy tenant_isolation on item_premises_approvals
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on item_premises_approvals to mop_app;

-- ── 5. Seeds ────────────────────────────────────────────────────────────────
do $$
declare
  v_tenant uuid; v_sl uuid; v_rest uuid; v_clinic uuid; v_src text;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';
  select id into v_rest from facility_types where tenant_id = v_tenant and code = 'restaurant';
  select id into v_clinic from facility_types where tenant_id = v_tenant and code = 'clinic';
  v_src := 'docs/compliance/sharjah-medical-facility-pest-contract-requirements-ar.pdf (Sharjah Municipality, filed 13 Aug 2026)';

  -- frequencies: what we know, and only what we know
  insert into compliance_visit_frequencies
    (tenant_id, service_line_id, emirate, facility_type_id, target_pest_group, visits_per_year, source, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'Sharjah', v_rest,   'general',  24, 'Municipality requirement (owner-stated, 12 Aug 2026)', false, null),
    (v_tenant, v_sl, 'Dubai',   v_rest,   'general',  24, 'Municipality requirement (owner-stated, 12 Aug 2026)', false, null),
    (v_tenant, v_sl, 'Sharjah', v_clinic, 'general',  12, v_src, false, null),
    (v_tenant, v_sl, 'Sharjah', v_clinic, 'mosquito', 24, v_src, false, null)
  on conflict do nothing;

  -- the old single default is F&B-specific — say so where it lives
  update settings
     set description = 'F&B ONLY: pest-control visits/year for restaurants in Sharjah & Dubai (municipality). '
        || 'Frequency is premises-category x pest specific — see compliance_visit_frequencies / fn_visit_frequency. '
        || 'Medical (Sharjah): 12/yr general, 24/yr mosquito.'
   where tenant_id = v_tenant and key = 'schedule.fnb_visits_per_year';

  -- scheduling constraints: medical = night by regulation; 24h institutions 00:00-03:00
  insert into compliance_scheduling_rules
    (tenant_id, service_line_id, emirate, facility_type_id, applies_when, force_night, window_start, window_end, note, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'Sharjah', v_clinic, null, true, null, null,
     'Treatment outside official working hours; treated area unoccupied. Regulatory, not a preference.', false, null),
    (v_tenant, v_sl, 'Sharjah', v_clinic, '24-hour institutions', true, time '00:00', time '03:00',
     'Hard treatment window for institutions operating around the clock.', false, null)
  on conflict do nothing;

  -- contract clauses for Sharjah medical facilities (wording is an English
  -- rendering of the Arabic source — ASSUMED until owner/legal confirms the text)
  insert into contract_clause_templates
    (tenant_id, service_line_id, facility_type_id, emirate, clause_key, heading, body, sort_order, is_required, is_assumed, assumed_note, source_ref)
  select v_tenant, v_sl, v_clinic, 'Sharjah', x.k, x.h, x.b, x.o, true, true,
         'English rendering of the Arabic source - confirm wording with owner/legal', v_src
  from (values
    ('building_description', 'Building description', 'The agreement shall include a detailed description of the building: number of floors, external premises, all service rooms including the medical waste room, and any annexes.', 10),
    ('scope_harbourage', 'Scope of service', 'The scope shall cover every potential pest harbourage within the described building and premises.', 20),
    ('whole_building_responsibility', 'Whole-building responsibility', 'The contractor is explicitly responsible for the entire building, including vacant and unoccupied rooms.', 30),
    ('target_pests', 'Target pests', 'Target pests are categorised as: crawling insects (e.g. cockroaches, ants, bedbugs), flying insects (e.g. flies, mosquitoes), and rodents.', 40),
    ('visit_frequency', 'Service frequency', 'Service frequency per this facility: general pest control 12 visits per year; mosquito control 24 visits per year (Sharjah Municipality).', 50),
    ('ipm_commitment', 'Integrated Pest Management', 'The contractor commits to IPM: physical and environmental control measures are emphasised first; chemical control is applied only when necessary.', 60),
    ('working_hours', 'Treatment hours', 'Treatment shall take place outside official working hours, with the treatment area unoccupied.', 70),
    ('24h_window', '24-hour institutions', 'For institutions operating 24 hours, treatment shall be carried out between 00:00 and 03:00.', 80),
    ('indoor_pesticide', 'Indoor pesticide criteria', 'The named indoor pesticide shall be odourless, have a knock-down effect, low toxicity, cause no irritation or allergic reaction, and be dosed so as not to affect patients or inpatients.', 90),
    ('ede_msds', 'Registration and safety documents', 'The pesticide''s EDE registration certificate and MSDS shall be attached to this agreement.', 100),
    ('termination_notice', 'Municipality notification', 'The municipality shall be notified within 15 days of any termination or cancellation of this contract.', 110)
  ) as x(k, h, b, o)
  on conflict do nothing;
end $$;
