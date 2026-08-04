-- 039_identity_rbac.sql
-- Security hardening Phase A1: identity + RBAC schema and the actor GUC accessor.
-- ADDITIVE and INERT — nothing in the app calls these yet. Auth wiring is A2; the
-- switch off the superuser role onto mop_app (making RLS the live boundary) is A3.
-- So this migration changes no behaviour.
--
-- External parties (auditors, municipality inspectors) are NOT app_users and no
-- role here grants them access. Per Constitution Art. V they receive scoped,
-- expiring links — a separate mechanism, built later. Noted here on purpose so
-- the boundary is explicit and not "discovered" during A2/A3.

-- Actor GUC accessor (mirrors app_current_tenant). Null when unset.
create or replace function app_current_actor() returns uuid language sql stable as $$
  select nullif(current_setting('app.current_actor', true), '')::uuid;
$$;

-- Global capability catalogue (app-wide permission codes; not tenant-scoped).
create table permissions (
  code        text primary key,
  description text not null
);
grant select on permissions to mop_app;

-- App users — 1:1 with Supabase auth.users.id. NO passwords stored here.
create table app_users (
  id            uuid primary key,                       -- = auth.users.id
  tenant_id     uuid not null references tenants(id),
  full_name     text,
  email         text,
  technician_id uuid references technicians(id),        -- links a field user to their technician record
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(), created_by uuid,
  updated_at    timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, email)
);
create index app_users_tenant_idx on app_users(tenant_id);
create trigger app_users_touch before update on app_users for each row execute function set_updated_at();
alter table app_users enable row level security;
create policy tenant_isolation on app_users using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on app_users to mop_app;

-- Roles (per-tenant so a tenant can customise; seeded ASSUMED).
create table roles (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  code       text not null,
  name       text not null,
  is_assumed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);
alter table roles enable row level security;
create policy tenant_isolation on roles using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on roles to mop_app;

create table role_permissions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  role_id         uuid not null references roles(id),
  permission_code text not null references permissions(code),
  unique (role_id, permission_code)
);
alter table role_permissions enable row level security;
create policy tenant_isolation on role_permissions using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on role_permissions to mop_app;

create table user_roles (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id   uuid not null references app_users(id),
  role_id   uuid not null references roles(id),
  unique (user_id, role_id)
);
alter table user_roles enable row level security;
create policy tenant_isolation on user_roles using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on user_roles to mop_app;

-- Cron/worker pinhole: returns tenant IDs ONLY (nothing sensitive), so scheduled
-- jobs can iterate tenants under mop_app WITHOUT a superuser bypass. This is the
-- single, auditable escalation in the system (SECURITY DEFINER).
create or replace function fn_all_active_tenant_ids()
returns setof uuid language sql security definer set search_path = public as $$
  select id from tenants;
$$;
grant execute on function fn_all_active_tenant_ids() to mop_app;

-- ── Seed the capability catalogue ─────────────────────────────────────────
insert into permissions(code, description) values
  ('customer.view','View customers'), ('customer.edit','Create/edit/archive customers'),
  ('contract.view','View contracts'), ('contract.edit','Create/edit contracts'), ('contract.activate','Activate contracts'),
  ('job.view','View jobs'), ('job.edit','Create/edit jobs'),
  ('estimate.view','View estimates'), ('estimate.edit','Create/edit estimates'), ('survey.edit','Create/edit surveys'),
  ('inventory.view','View inventory'), ('inventory.edit','Manage inventory/purchases'),
  ('service_report.file','File service reports'), ('service_report.approve','Approve service reports'),
  ('invoice.view','View invoices'), ('invoice.issue','Issue invoices'), ('invoice.cancel','Cancel invoices'), ('invoice.edit_approve','Approve invoice edits'),
  ('payment.record','Record receipts/payments'),
  ('creditnote.issue','Issue credit notes'), ('refund.record','Record refunds'),
  ('billing.run','Run recurring billing'), ('discount.approve','Approve discounts'),
  ('gl.view','View the general ledger'), ('report.view','View reports'), ('profit.view','View profitability/margins'),
  ('user.manage','Manage users and roles'), ('settings.manage','Manage settings')
on conflict (code) do nothing;

-- ── Seed roles per tenant ─────────────────────────────────────────────────
insert into roles(tenant_id, code, name, is_assumed)
select t.id, v.code, v.name, true from tenants t
cross join (values
  ('admin','Administrator'), ('management','Management'), ('finance','Finance'),
  ('operations','Operations'), ('technician','Technician'), ('viewer','Viewer')
) v(code, name)
on conflict (tenant_id, code) do nothing;

-- management + admin = every permission
insert into role_permissions(tenant_id, role_id, permission_code)
select r.tenant_id, r.id, p.code from roles r cross join permissions p
where r.code in ('management','admin')
on conflict (role_id, permission_code) do nothing;

-- explicit maps for the constrained roles (profit/GL stay management/finance only;
-- technicians get no financial permissions)
insert into role_permissions(tenant_id, role_id, permission_code)
select r.tenant_id, r.id, m.perm from roles r
join (values
  -- viewer: read-only, non-financial
  ('viewer','customer.view'), ('viewer','contract.view'), ('viewer','job.view'), ('viewer','estimate.view'), ('viewer','invoice.view'), ('viewer','report.view'),
  -- technician: field only, NO financials
  ('technician','job.view'), ('technician','service_report.file'),
  -- operations: run the field business; NO gl/profit/cancel/credit/refund/discount
  ('operations','customer.view'), ('operations','customer.edit'),
  ('operations','contract.view'), ('operations','contract.edit'), ('operations','contract.activate'),
  ('operations','job.view'), ('operations','job.edit'),
  ('operations','estimate.view'), ('operations','estimate.edit'), ('operations','survey.edit'),
  ('operations','inventory.view'), ('operations','inventory.edit'),
  ('operations','service_report.file'), ('operations','service_report.approve'),
  ('operations','invoice.view'), ('operations','report.view'),
  -- finance: the money; gets gl.view + profit.view (management/finance only)
  ('finance','customer.view'), ('finance','contract.view'),
  ('finance','invoice.view'), ('finance','invoice.issue'), ('finance','invoice.cancel'), ('finance','invoice.edit_approve'),
  ('finance','payment.record'), ('finance','creditnote.issue'), ('finance','refund.record'),
  ('finance','billing.run'), ('finance','discount.approve'),
  ('finance','gl.view'), ('finance','report.view'), ('finance','profit.view')
) m(role_code, perm) on m.role_code = r.code
on conflict (role_id, permission_code) do nothing;
