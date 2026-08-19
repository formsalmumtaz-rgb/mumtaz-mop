-- 116_google_identity_allowlist.sql
-- §3.7 — "Google sign-in restricted to pre-registered employee emails: each
-- employee record carries their Google email and OAuth succeeds only on a match;
-- unknown Google accounts are REJECTED, NEVER AUTO-PROVISIONED. Email/password
-- remains the fallback."
--
-- The default is already refusal: resolveActor joins app_users on the auth user
-- id, so a Google account nobody registered resolves to no session at all. What
-- was missing is the safe way to say YES to somebody who IS registered.
--
-- Not by re-keying app_users.id (it is the auth user id and user_roles points at
-- it) — a separate identity table, so one employee can hold a password login and
-- a Google login without either overwriting the other.
alter table app_users
  add column if not exists google_email text;

comment on column app_users.google_email is
  'The Google address this employee is permitted to sign in with. NULL = no Google sign-in for them. Matching is case-insensitive and exact — never a domain rule.';

create unique index if not exists app_users_google_email_uq
  on app_users (tenant_id, lower(google_email)) where google_email is not null;

create table if not exists app_user_identities (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  app_user_id      uuid not null references app_users(id),
  provider         text not null check (provider in ('google','password')),
  provider_user_id uuid not null,          -- the Supabase auth user id
  email            text not null,
  linked_at        timestamptz not null default now(),
  unique (provider, provider_user_id)
);
create index if not exists app_user_identities_user_idx on app_user_identities (tenant_id, app_user_id);

comment on table app_user_identities is
  'Which external logins map to which employee. A row exists only because a human pre-registered that address (3.7); nothing here is created by signing in.';

alter table app_user_identities enable row level security;
drop policy if exists tenant_isolation on app_user_identities;
create policy tenant_isolation on app_user_identities
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select on app_user_identities to mop_app;

-- The whole allowlist decision, in one place.
--
-- Returns the app_user id when this Google address belongs to an ACTIVE employee,
-- and links the identity on first use. Returns NULL for everything else — an
-- address nobody registered, a deactivated employee, an address registered to a
-- different tenant. It NEVER inserts an app_user: a login can only ever attach to
-- a record a human created first.
create or replace function fn_link_google_identity(p_auth_id uuid, p_email text)
returns uuid language plpgsql security definer as $$
declare v_user uuid; v_tenant uuid;
begin
  if p_email is null or btrim(p_email) = '' then return null; end if;

  -- already linked: the ordinary case after the first sign-in
  select app_user_id into v_user from app_user_identities
   where provider = 'google' and provider_user_id = p_auth_id;
  if v_user is not null then
    return (select u.id from app_users u where u.id = v_user and u.is_active);
  end if;

  -- the employee's own record IS the auth user (created with this address)
  select id, tenant_id into v_user, v_tenant from app_users
   where id = p_auth_id and is_active;
  if v_user is not null then
    insert into app_user_identities (tenant_id, app_user_id, provider, provider_user_id, email)
      values (v_tenant, v_user, 'google', p_auth_id, lower(btrim(p_email)))
      on conflict (provider, provider_user_id) do nothing;
    return v_user;
  end if;

  -- pre-registered Google address on an active employee
  select id, tenant_id into v_user, v_tenant from app_users
   where lower(google_email) = lower(btrim(p_email)) and is_active;
  if v_user is null then
    return null;   -- unknown, or deactivated. Rejected. Nothing is created.
  end if;
  insert into app_user_identities (tenant_id, app_user_id, provider, provider_user_id, email)
    values (v_tenant, v_user, 'google', p_auth_id, lower(btrim(p_email)))
    on conflict (provider, provider_user_id) do nothing;
  return v_user;
end $$;

comment on function fn_link_google_identity(uuid, text) is
  '3.7 allowlist: returns the app_user for a pre-registered, active Google address and links it on first use. NULL otherwise. Never creates an app_user.';

revoke all on function fn_link_google_identity(uuid, text) from public;
grant execute on function fn_link_google_identity(uuid, text) to mop_app;
