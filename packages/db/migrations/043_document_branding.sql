-- 043_document_branding.sql
-- Division-aware document branding as REFERENCE DATA (Art. XVIII: data, not code).
-- Generated documents pick their logo/name from this table by the document's
-- division (service line) — pest-control reports carry the Pest Control mark,
-- cleaning the Cleaning Crew mark, FM the Facilities Management mark, and
-- group/unmatched documents fall back to the Mumtaz ISG mark. The mapping is
-- editable from admin; nothing about which logo a document carries is hardcoded.
--
-- logo_key names an asset bundled with the app (apps/ops-console/public/brand).
-- Uploading a tenant's own logo file is a later enhancement; the division→brand
-- MAPPING is already data here, which is what Art. XVIII requires.

create table document_branding (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid not null references tenants(id),
  brand_key                    text not null,              -- 'group','pest_control','cleaning','fm'
  name                         text not null,              -- printed company/division name
  logo_key                     text not null,              -- asset filename under /public/brand
  tagline                      text,
  applies_to_service_line_code text,                       -- null => group/default fallback
  show_toll_free               boolean not null default true,
  is_active                    boolean not null default true,
  is_assumed                   boolean not null default false,
  assumed_note                 text,
  confirmed_by                 uuid, confirmed_at timestamptz,
  created_at                   timestamptz not null default now(), created_by uuid,
  updated_at                   timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, brand_key)
);
create index document_branding_tenant_idx on document_branding (tenant_id);
create trigger document_branding_touch before update on document_branding
  for each row execute function set_updated_at();

alter table document_branding enable row level security;
create policy tenant_isolation on document_branding
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on document_branding to mop_app;

-- Seed the four Mumtaz divisions for every existing tenant (deterministic,
-- set-based — byte-identical on rebuild). Group is the fallback (applies_to null).
insert into document_branding (tenant_id, brand_key, name, logo_key, tagline, applies_to_service_line_code, show_toll_free)
select t.id, v.brand_key, v.name, v.logo_key, v.tagline, v.applies_to, v.toll
from tenants t
cross join (values
  ('group',        'Mumtaz Integrated Services Group', 'mumtaz-isg.png',                   'Integrated Services Group', null,           true),
  ('pest_control', 'Mumtaz Pest Control',              'mumtaz-pest-control.png',          'Pest Control · UAE',        'pest_control', true),
  ('cleaning',     'Mumtaz Cleaning Crew',             'mumtaz-cleaning-crew.png',         'Cleaning Services · UAE',   'cleaning',     true),
  ('fm',           'Mumtaz Facilities Management',     'mumtaz-facilities-management.png', 'Facilities Management · UAE','fm',          true)
) as v(brand_key, name, logo_key, tagline, applies_to, toll);
