-- 005_agreement_schema.sql
-- MOP K1 — schema the Phase-2 agreement generator plugs into. MOP is the single
-- source of truth; the generator becomes a pure renderer. NOT building the
-- generator here — only the tables/fields it reads and writes.
--   * facility_types: MOP-owned reference catalogue (generator does not keep its own list)
--   * per-facility-type field schemas ride field_definitions + attributes
--   * contracts gain a home for every agreement field
--   * generated_documents: append-only rendered agreement + frozen snapshot
--   * customers.trade_license: first-class (source of TRN; closes the TRN gap)

-- ── facility_types (MOP-owned reference catalogue) ─────────────────────
create table facility_types (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid not null references service_lines(id),
  code            text not null,          -- 'restaurant','villa','warehouse','clinic',...
  name            text not null,
  description     text,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger facility_types_touch before update on facility_types for each row execute function set_updated_at();

-- ── field_definitions gains facility-type scoping ──────────────────────
-- Per-facility-type form field schemas map onto the existing field_definitions
-- + attributes pattern. facility_type_id null = applies to all facility types.
alter table field_definitions add column facility_type_id uuid references facility_types(id);

-- Replace the old uniqueness (which ignored facility_type) with a null-safe
-- unique index that treats missing service_line / facility_type as equal.
do $$
declare cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'field_definitions'::regclass and contype = 'u';
  if cname is not null then
    execute format('alter table field_definitions drop constraint %I', cname);
  end if;
end $$;

create unique index field_definitions_uniq on field_definitions (
  tenant_id,
  coalesce(service_line_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(facility_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
  entity_type,
  field_key
);

-- ── customers.trade_license (first-class; source of TRN) ───────────────
alter table customers add column trade_license text;   -- blank-allowed; captured at signing

-- ── customer_branches gain a facility type ─────────────────────────────
alter table customer_branches add column facility_type_id uuid references facility_types(id);

-- ── contracts gain agreement fields ────────────────────────────────────
-- Homes for every field in the generator's agreements table. (service_scope,
-- frequency, price, currency already exist as scope_of_work / frequency_id /
-- contract_value / currency.)
alter table contracts add column facility_type_id uuid references facility_types(id);
alter table contracts add column term_months integer;
alter table contracts add column prepared_by uuid;      -- staff actor who prepared it

-- ── generated_documents (append-only rendered artefact + snapshot) ─────
create table generated_documents (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid not null references tenants(id),
  service_line_id              uuid references service_lines(id),
  contract_id                  uuid references contracts(id),
  doc_type                     text not null
                               check (doc_type in ('service_report','certificate','invoice','agreement','quotation')),
  document_template_version_id uuid references document_template_versions(id),
  language                     text not null default 'en' check (language in ('en','ar')),
  version_no                   integer not null default 1,
  storage_key                  text,                     -- rendered docx/pdf in R2
  -- frozen field values used to render (F2/F3): facility_type, trade_license,
  -- TRN, service_scope, frequency, price, currency, term, parties, prepared_by,
  -- dates. The document must reproduce identically regardless of later edits.
  snapshot                     jsonb not null default '{}'::jsonb,
  generated_at                 timestamptz not null default now(),
  created_at                   timestamptz not null default now(), created_by uuid
);
create index generated_documents_contract_idx on generated_documents (contract_id);
create trigger generated_documents_append_only before update or delete on generated_documents
  for each row execute function enforce_append_only();

-- ── contracts link to the generated agreement document ─────────────────
alter table contracts add column generated_document_id uuid references generated_documents(id);
