-- 014_customer_groups.sql
-- Customer groups — a parent group over otherwise-independent customers.
--
-- Design (owner-approved, "Option B"): a customer's permanent reference
-- (customers.code, e.g. CUST-0088) is GROUP-NEUTRAL and immutable. Group
-- membership lives here, in a SEPARATE, fully-editable relationship — attaching,
-- detaching, renaming, or dissolving a group never touches a customer's
-- reference. This is what survives a member leaving or a group dissolving: the
-- account number answers "who is this, forever"; the group answers "who do they
-- belong to, right now."
--
-- First real group: "Sultan Al Arab" — six independent legal entities, each with
-- its own contract, account number and (when known) TRN, under one group.
--
-- Additive only. Touches no ledger/append-only table; no invariant relaxed.

create table customer_groups (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  code            text,          -- short display/filter code (e.g. 'SAA'); NOT an identity, editable
  name            text not null, -- 'Sultan Al Arab'
  attributes      jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid,
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  unique (tenant_id, code)
);

create trigger customer_groups_touch
  before update on customer_groups
  for each row execute function set_updated_at();

-- Membership: nullable so a customer can exist with no group, and be
-- attached/detached freely. The reference (customers.code) never changes with it.
alter table customers
  add column group_id uuid references customer_groups(id);

create index customer_groups_tenant_idx on customer_groups(tenant_id);
create index customers_group_idx on customers(group_id) where group_id is not null;

-- RLS: same tenant-isolation shape as every other tenant-scoped table (009_rls.sql).
alter table customer_groups enable row level security;
create policy tenant_isolation on customer_groups
  using (tenant_id = app_current_tenant())
  with check (tenant_id = app_current_tenant());

-- New table needs the app-role grant explicitly (009's blanket grant only covered
-- tables that existed then).
grant select, insert, update, delete on customer_groups to mop_app;
