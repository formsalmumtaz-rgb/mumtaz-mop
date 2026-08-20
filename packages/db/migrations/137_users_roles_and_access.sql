-- 137_users_roles_and_access.sql
-- The last gate before real people use the system: who exists, what they may
-- see, and how someone becomes a user at all.
--
-- Three things, and the reasoning for each.
--
-- 1. THE ROLE MODEL DID NOT MATCH THE BUSINESS.
--    · `management` held all 33 permissions — identical to `admin`, including
--      settings.manage and user.manage. "Management runs operations, admin runs
--      the company" was the intent; the data said management IS admin.
--    · `operations` — the sales-capable engineer role — held expense.view,
--      expense.record and report.view. Expenses are direct cost and /reports is
--      almost entirely financial (P&L, GL, trial balance, balance sheet, VAT).
--      A role defined as "never sees cost or margin" could read all of it.
--    · /hr was guarded by technician.edit, which `operations` holds. The HR
--      screen was open to the one role explicitly barred from HR and payroll.
--
-- 2. HR AND FINANCIAL REPORTING HAD NO PERMISSIONS OF THEIR OWN, so they were
--    guarded by whatever was nearest. Both get their own.
--
-- 3. GOOGLE SIGN-IN WAS AN ALLOWLIST. fn_link_google_identity returned null for
--    any address not pre-registered against an employee — nothing created, no
--    trace. The owner does not have the technicians' Gmail addresses, so the
--    model inverts: anyone may present themselves, nobody is provisioned, and a
--    human matches them to a staff record before any access exists.

-- ── 1. The permissions that were missing ───────────────────────────────
insert into permissions (code, description) values
  ('hr.view',          'See the HR module: leave, requests, attendance, staff records.'),
  ('hr.manage',        'Decide HR requests and edit staff records.'),
  ('report.financial', 'See financial reports: P&L, general ledger, trial balance, balance sheet, VAT, revenue, customer statements.')
on conflict (code) do update set description = excluded.description;

-- ── 2. The role matrix, corrected ──────────────────────────────────────
-- Admin gets everything, always — including anything added later.
insert into role_permissions (tenant_id, role_id, permission_code)
select r.tenant_id, r.id, p.code
  from roles r cross join permissions p
 where r.code = 'admin'
on conflict (role_id, permission_code) do nothing;

-- MANAGEMENT: all daily operations INCLUDING finance and HR. NOT the company
-- itself — company details, system configuration and user management stay with
-- admin. That is the whole distinction between the two roles.
delete from role_permissions rp
 using roles r
 where rp.role_id = r.id and r.code = 'management'
   and rp.permission_code in ('settings.manage', 'user.manage');

insert into role_permissions (tenant_id, role_id, permission_code)
select r.tenant_id, r.id, p.code
  from roles r cross join permissions p
 where r.code = 'management'
   and p.code in ('hr.view', 'hr.manage', 'report.financial')
on conflict (role_id, permission_code) do nothing;

-- OPERATIONS: the sales-capable engineer. Sells, schedules and runs the field.
-- Sees the price the engine suggests and the reference rates behind it. Never
-- sees what the work costs us, what it earns us, HR, or a financial report.
delete from role_permissions rp
 using roles r
 where rp.role_id = r.id and r.code = 'operations'
   and rp.permission_code in (
     'expense.view',      -- expenses ARE direct cost
     'expense.record',
     'report.view',       -- /reports is P&L, GL, trial balance, balance sheet, VAT
     'profit.view',       -- (already absent; stated so the intent is explicit)
     'gl.view',
     'report.financial',
     'hr.view',
     'hr.manage',
     'settings.manage',
     'user.manage'
   );

-- What operations MUST hold, stated positively so a later edit that drops one
-- is visible as a change rather than an absence.
insert into role_permissions (tenant_id, role_id, permission_code)
select r.tenant_id, r.id, p.code
  from roles r cross join permissions p
 where r.code = 'operations'
   and p.code in (
     'customer.view', 'customer.edit',          -- create new customers
     'survey.edit',                             -- run surveys
     'estimate.view', 'estimate.edit',          -- estimates and quotations
     'contract.view', 'contract.edit', 'contract.activate',  -- convert, sign AMCs
     'invoice.view',                            -- due payments / AR for collections
     'job.view', 'job.edit',                    -- schedules
     'inventory.view', 'inventory.edit',        -- chemicals, stock, equipment
     'technician.edit',                         -- technicians
     'preflight.submit',
     'service_report.file', 'service_report.approve'
   )
on conflict (role_id, permission_code) do nothing;

-- FINANCE keeps the money, and gains the financial reports it was already
-- expected to read.
insert into role_permissions (tenant_id, role_id, permission_code)
select r.tenant_id, r.id, p.code
  from roles r cross join permissions p
 where r.code = 'finance' and p.code in ('report.financial')
on conflict (role_id, permission_code) do nothing;

-- ── 3. Users have a lifecycle, not a boolean ───────────────────────────
-- is_active could not express "this person exists and is waiting to be let in".
-- Self-registration needs exactly that state, and it must not read as active.
alter table app_users add column if not exists status text;
alter table app_users add column if not exists last_sign_in_at timestamptz;
alter table app_users add column if not exists approved_by uuid references app_users(id);
alter table app_users add column if not exists approved_at timestamptz;
alter table app_users add column if not exists rejected_reason text;

update app_users set status = case when is_active then 'active' else 'deactivated' end
 where status is null;

alter table app_users alter column status set default 'pending';
alter table app_users alter column status set not null;

alter table app_users drop constraint if exists app_users_status_check;
alter table app_users add constraint app_users_status_check
  check (status in ('pending', 'active', 'deactivated'));

-- is_active stays, and stays in step: everything already reads it, and one of
-- the two must be the source of truth. status is; is_active follows.
create or replace function fn_app_user_status_sync() returns trigger
language plpgsql as $$
begin
  new.is_active := (new.status = 'active');
  return new;
end $$;

drop trigger if exists app_user_status_sync on app_users;
create trigger app_user_status_sync
  before insert or update of status on app_users
  for each row execute function fn_app_user_status_sync();

comment on column app_users.status is
  'pending = self-registered, no access until a human approves. active = may sign in. deactivated = access ended. is_active is derived from this by trigger; status is the source of truth.';

create index if not exists app_users_pending_idx on app_users (tenant_id, status)
  where status = 'pending';

-- ── 4. Google sign-in: self-present, then be verified ──────────────────
-- Was: an address nobody pre-registered is rejected and leaves no trace, so the
-- owner had no way to see who tried. Now: the person is recorded as PENDING with
-- the name and address Google gave, holds no roles, and reaches nothing until an
-- admin or management user matches them to a staff record and grants a role.
--
-- Returns the app_user id ONLY for an active user. A pending or deactivated one
-- returns null, exactly as an unknown address did — the caller cannot tell them
-- apart, and neither gets a session.
create or replace function fn_link_google_identity(p_auth_id uuid, p_email text, p_full_name text default null)
returns uuid
language plpgsql
security definer
as $$
declare v_user uuid; v_tenant uuid; v_status text;
begin
  if p_email is null or btrim(p_email) = '' then return null; end if;

  -- already linked: the ordinary case after the first sign-in
  select app_user_id into v_user from app_user_identities
   where provider = 'google' and provider_user_id = p_auth_id;
  if v_user is not null then
    update app_users set last_sign_in_at = now() where id = v_user and status = 'active';
    return (select u.id from app_users u where u.id = v_user and u.status = 'active');
  end if;

  -- the employee's own record IS the auth user (created with this address)
  select id, tenant_id, status into v_user, v_tenant, v_status from app_users where id = p_auth_id;
  if v_user is null then
    -- or an address an admin pre-registered against a staff record
    select id, tenant_id, status into v_user, v_tenant, v_status from app_users
     where lower(google_email) = lower(btrim(p_email));
  end if;

  if v_user is null then
    -- Nobody knows this address. Record the request; grant nothing.
    -- One tenant today (Art. II); the pending row lands there so a human sees it.
    select id into v_tenant from tenants order by created_at limit 1;
    insert into app_users (id, tenant_id, full_name, email, google_email, status)
      values (p_auth_id, v_tenant, nullif(btrim(coalesce(p_full_name, '')), ''),
              lower(btrim(p_email)), lower(btrim(p_email)), 'pending')
    on conflict (id) do nothing;
    insert into app_user_identities (tenant_id, app_user_id, provider, provider_user_id, email)
      values (v_tenant, p_auth_id, 'google', p_auth_id, lower(btrim(p_email)))
    on conflict (provider, provider_user_id) do nothing;
    return null;                       -- pending: no session, no data
  end if;

  insert into app_user_identities (tenant_id, app_user_id, provider, provider_user_id, email)
    values (v_tenant, v_user, 'google', p_auth_id, lower(btrim(p_email)))
  on conflict (provider, provider_user_id) do nothing;

  if v_status <> 'active' then return null; end if;   -- pending or deactivated
  update app_users set last_sign_in_at = now() where id = v_user;
  return v_user;
end $$;

comment on function fn_link_google_identity(uuid, text, text) is
  'First Google sign-in records the person as PENDING and returns null — they get no session and no data until an admin matches them to a staff record and grants a role. Never auto-provisions access.';

grant execute on function fn_link_google_identity(uuid, text, text) to mop_app;
