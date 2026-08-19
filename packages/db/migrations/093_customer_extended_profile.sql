-- 093_customer_extended_profile.sql
-- Run 8 item 1: the customer record carries what the business actually needs to
-- serve, bill and route a customer — not just a name and a TRN.
--
-- Every column is nullable: an existing customer stays valid, blank stays blank
-- (Art. VI — nothing invented). Values that drive behaviour are constrained so a
-- typo cannot silently become a business rule.

-- Industry category is REFERENCE DATA (editable in the console), not an enum:
-- the owner adds "laundry" without a deploy.
create table if not exists industry_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  code        text not null,
  name        text not null,
  sort_order  int  not null default 100,
  is_active   boolean not null default true,
  unique (tenant_id, code)
);
alter table industry_categories enable row level security;
drop policy if exists tenant_isolation on industry_categories;
create policy tenant_isolation on industry_categories
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on industry_categories to mop_app;

insert into industry_categories (tenant_id, code, name, sort_order)
select t.id, x.code, x.name, x.ord
  from tenants t,
       (values ('restaurant','Restaurant / Café',10), ('hotel','Hotel / Hospitality',20),
               ('medical','Medical / Clinic',30),    ('educational','Educational',40),
               ('retail','Retail / Supermarket',50), ('warehouse','Warehouse / Factory',60),
               ('residential','Residential',70),     ('automotive','Automotive',80),
               ('other','Other',999)) as x(code,name,ord)
on conflict (tenant_id, code) do nothing;

alter table customers
  -- identity
  add column if not exists industry_category_id     uuid references industry_categories(id),
  add column if not exists municipality_category_id uuid references municipality_categories(id),
  add column if not exists trade_licence_no         text,
  -- contact
  add column if not exists contact_person           text,
  add column if not exists contact_designation      text,
  add column if not exists whatsapp                 text,
  -- service preferences
  add column if not exists preferred_shift          text,
  add column if not exists preferred_language       text,
  -- commercial
  add column if not exists payment_terms            text,
  add column if not exists billing_frequency        text,
  add column if not exists referred_by              text,
  -- operations: what the technician needs at the door
  add column if not exists access_notes             text,
  -- the file's own conventions (mig 093 companion to the master import)
  add column if not exists alias_name               text,
  add column if not exists place_of_supply          text,
  add column if not exists district                 text,
  add column if not exists po_box                   text,
  add column if not exists priority                 text,
  add column if not exists location_source          text,
  add column if not exists location_status          text,
  add column if not exists required_info            text,
  add column if not exists notes                    text;

-- Constrained vocabularies. Each allows NULL (unknown stays unknown) but refuses
-- a value outside the set, so 'Net30' can never sit beside 'net_30'.
do $$
begin
  begin alter table customers add constraint customers_preferred_shift_check
    check (preferred_shift is null or preferred_shift in ('day','night'));
  exception when duplicate_object then null; end;
  begin alter table customers add constraint customers_preferred_language_check
    check (preferred_language is null or preferred_language in ('EN','AR'));
  exception when duplicate_object then null; end;
  begin alter table customers add constraint customers_payment_terms_check
    check (payment_terms is null or payment_terms in ('cash_on_service','net_15','net_30'));
  exception when duplicate_object then null; end;
  begin alter table customers add constraint customers_billing_frequency_check
    check (billing_frequency is null or billing_frequency in ('per_visit','monthly','quarterly','annual'));
  exception when duplicate_object then null; end;
  begin alter table customers add constraint customers_priority_check
    check (priority is null or priority in ('High','Medium','Low'));
  exception when duplicate_object then null; end;
  begin alter table customers add constraint customers_location_status_check
    check (location_status is null or location_status in ('VERIFIED','UNVERIFIED','AREA_APPROX','NO_LOCATION'));
  exception when duplicate_object then null; end;
  -- customer_type was already in use; pin the vocabulary now that B2G is real.
  begin alter table customers add constraint customers_customer_type_check
    check (customer_type is null or customer_type in ('B2B','B2C','B2G'));
  exception when duplicate_object then null; end;
end $$;

comment on column customers.place_of_supply is
  'UAE VAT place of supply. DISTINCT from emirate even when the values agree today — VAT treatment follows this column, not the postal emirate.';
comment on column customers.location_status is
  'VERIFIED / UNVERIFIED / AREA_APPROX (district centroid — approximate, shown as such to technicians) / NO_LOCATION (captured at the door).';
comment on column customers.required_info is
  'Fields the customer record is missing. Non-empty makes the profile prompt for capture on open — the record completes through daily use.';

create index if not exists customers_required_info_idx on customers (tenant_id) where required_info is not null;
create index if not exists customers_industry_idx on customers (industry_category_id);
