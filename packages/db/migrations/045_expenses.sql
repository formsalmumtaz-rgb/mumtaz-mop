-- 045_expenses.sql
-- Operational expense tracking (§18). Lightweight — NOT a general ledger. An
-- expense is a claim with a status lifecycle; the cash-allocation gate ("paid"
-- only from "approved") is enforced in the DATABASE by a transition trigger, so
-- no app path can bypass approval. Offline-syncable via client_uuid idempotency.

-- ── New RBAC permissions (extend mig 039) ─────────────────────────────────
insert into permissions(code, description) values
  ('expense.view',    'View expenses'),
  ('expense.record',  'Create/submit/edit expense claims'),
  ('expense.approve', 'Approve, reject, and mark expenses paid (cash allocation)')
on conflict (code) do nothing;

-- management + admin get everything (mirror 039's cross-join for the new codes).
insert into role_permissions(tenant_id, role_id, permission_code)
select r.tenant_id, r.id, p.code from roles r cross join permissions p
where r.code in ('management','admin') and p.code in ('expense.view','expense.record','expense.approve')
on conflict (role_id, permission_code) do nothing;

-- constrained roles: finance handles cash (all three); operations submit but do
-- not approve; viewer reads only. (Technicians stay financial-free per Art. — a
-- field expense-capture path comes later via the offline app.)
insert into role_permissions(tenant_id, role_id, permission_code)
select r.tenant_id, r.id, m.perm from roles r
join (values
  ('finance','expense.view'), ('finance','expense.record'), ('finance','expense.approve'),
  ('operations','expense.view'), ('operations','expense.record'),
  ('viewer','expense.view')
) as m(role, perm) on m.role = r.code
on conflict (role_id, permission_code) do nothing;

-- ── Expense categories (configurable reference data, Art. XVIII) ───────────
create table expense_categories (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  code          text not null,
  name          text not null,
  is_active     boolean not null default true,
  is_assumed    boolean not null default false,
  assumed_note  text,
  confirmed_by  uuid, confirmed_at timestamptz,
  created_at    timestamptz not null default now(), created_by uuid,
  updated_at    timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, code)
);
create trigger expense_categories_touch before update on expense_categories for each row execute function set_updated_at();
alter table expense_categories enable row level security;
create policy tenant_isolation on expense_categories using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on expense_categories to mop_app;

-- ── Expenses ──────────────────────────────────────────────────────────────
create table expenses (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  category_id     uuid references expense_categories(id),
  expense_date    date not null default current_date,
  amount          numeric not null check (amount > 0),
  currency        text not null default 'AED',
  description     text,
  vehicle_id      uuid references vehicles(id),
  job_id          uuid references jobs(id),
  technician_id   uuid references technicians(id),          -- who incurred it
  payment_method  text check (payment_method is null or payment_method in ('cash','card','bank_transfer','company_account','other')),
  status          text not null default 'submitted'
                  check (status in ('draft','submitted','approved','rejected','paid')),
  approved_by     uuid, approved_at timestamptz, decision_note text,
  paid_at         timestamptz, paid_by uuid,
  client_uuid     uuid,                                      -- offline idempotency
  attributes      jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, client_uuid)
);
create index expenses_tenant_status_idx on expenses (tenant_id, status, expense_date);
create trigger expenses_touch before update on expenses for each row execute function set_updated_at();
alter table expenses enable row level security;
create policy tenant_isolation on expenses using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on expenses to mop_app;

-- Status transitions + the cash-allocation gate, enforced in the DB (belt and
-- suspenders regardless of app path). paid ⇐ approved only.
create or replace function tg_expense_transition() returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status then
    if not (
      (OLD.status = 'draft'     and NEW.status in ('submitted','rejected')) or
      (OLD.status = 'submitted' and NEW.status in ('approved','rejected','draft')) or
      (OLD.status = 'approved'  and NEW.status = 'paid') or
      (OLD.status = 'rejected'  and NEW.status in ('draft','submitted'))
    ) then
      raise exception 'Invalid expense status transition: % -> %', OLD.status, NEW.status;
    end if;
    if NEW.status = 'paid' and OLD.status <> 'approved' then
      raise exception 'Cash allocation requires an approved expense (got %)', OLD.status;
    end if;
  end if;
  return NEW;
end $$;
create trigger expenses_transition before update on expenses for each row execute function tg_expense_transition();

-- Seed standard expense categories per tenant (generic operational buckets).
insert into expense_categories (tenant_id, code, name)
select t.id, v.code, v.name from tenants t
cross join (values
  ('food',          'Food allowance'),
  ('fuel',          'Fuel'),
  ('vehicle',       'Vehicle expense'),
  ('accommodation', 'Accommodation'),
  ('supplies',      'Supplies'),
  ('misc',          'Miscellaneous')
) as v(code, name);
