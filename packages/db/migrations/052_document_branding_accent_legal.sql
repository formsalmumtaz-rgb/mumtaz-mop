-- 052_document_branding_accent_legal.sql
-- Prompt-1 document-branding rollout. Adds the two per-division skin fields that
-- were missing (accent colour + short label) and the GROUP-LEVEL legal block that
-- every generated document footer must carry (legal entity name, trade licence,
-- offices). All of it is reference data, editable from admin (Art. XVIII) — no
-- brand fact is hardcoded in a generator.

-- ── Per-division skin: accent colour + short label ─────────────────────────────
alter table document_branding
  add column if not exists accent_color text,   -- hex, e.g. '#A31E22'; per division
  add column if not exists label        text;   -- short division label, e.g. 'Pest Control'

-- Backfill the seeded divisions. Labels are owner-confirmed. Accents: pest is the
-- established Mumtaz red; cleaning/FM are derived from the logo wordmarks and stay
-- ASSUMED until the owner confirms the exact hex.
update document_branding set accent_color = '#A31E22', label = 'Pest Control'            where brand_key = 'pest_control';
update document_branding set accent_color = '#235B3C', label = 'Cleaning Crew'           where brand_key = 'cleaning';
update document_branding set accent_color = '#12294A', label = 'Facilities Management'   where brand_key = 'fm';
update document_branding set accent_color = '#A31E22', label = 'Integrated Services Group' where brand_key = 'group';

update document_branding
   set is_assumed = true,
       assumed_note = coalesce(assumed_note, 'Accent colour derived from the division logo — confirm the exact hex.')
 where brand_key in ('cleaning', 'fm');

-- ── Group legal block: one row per tenant ─────────────────────────────────────
-- The legal entity name + trade licence are FACTS the owner provided (not assumed).
-- Every document footer reads its legal line from here.
create table document_brand_org (
  tenant_id     uuid primary key references tenants(id),
  legal_name    text not null,
  group_line    text,
  established    text,
  trade_licence text,
  toll_free     text,
  email         text,
  is_assumed    boolean not null default false,
  assumed_note  text,
  created_at    timestamptz not null default now(), created_by uuid,
  updated_at    timestamptz not null default now(), updated_by uuid
);
alter table document_brand_org enable row level security;
create policy tenant_isolation on document_brand_org
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on document_brand_org to mop_app;
create trigger document_brand_org_touch before update on document_brand_org
  for each row execute function set_updated_at();

insert into document_brand_org (tenant_id, legal_name, group_line, established, trade_licence, toll_free, email)
select id, 'Al Mumtaz Bldg Clean & Pest Control', 'Mumtaz Integrated Services Group',
       '2006', '546486', '800 688', null
from tenants
on conflict (tenant_id) do nothing;

-- ── Office addresses: editable, ordered list per tenant ───────────────────────
create table document_brand_office (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  sort_order int  not null default 0,
  city       text not null,
  line1      text,
  line2      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid
);
create index document_brand_office_tenant_idx on document_brand_office (tenant_id);
alter table document_brand_office enable row level security;
create policy tenant_isolation on document_brand_office
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on document_brand_office to mop_app;
create trigger document_brand_office_touch before update on document_brand_office
  for each row execute function set_updated_at();

insert into document_brand_office (tenant_id, sort_order, city, line1, line2)
select t.id, v.ord, v.city, v.l1, v.l2
from tenants t
cross join (values
  (1, 'Dubai',     'Office F313, Al Hashmi Tower,', 'Deira, Dubai'),
  (2, 'Sharjah',   'Office 4, Al Estiqlal Street,', 'Al Manakh, Sharjah'),
  (3, 'Abu Dhabi', 'Office 504, Cont Building,',    'Musaffah, Abu Dhabi')
) as v(ord, city, l1, l2)
where not exists (select 1 from document_brand_office o where o.tenant_id = t.id);
