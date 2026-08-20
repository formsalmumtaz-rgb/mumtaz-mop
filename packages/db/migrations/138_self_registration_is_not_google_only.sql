-- 138_self_registration_is_not_google_only.sql
-- 137 gave Google sign-ins a pending queue. Password sign-ins still fell through
-- a hole: getSession() resolves the actor, finds no app_user, returns null, and
-- the person is bounced to /login forever — never in the queue, never visible,
-- with no way in short of someone writing a row by hand.
--
-- That matters right now because SUPABASE_SERVICE_ROLE_KEY is empty, so the
-- console cannot invite anyone. The fallback is to create the three users in the
-- Supabase dashboard — and that fallback only works if a dashboard-created user
-- who signs in appears somewhere a human can approve them.
--
-- So the rule stops being about Google and becomes the actual rule: ANY
-- authenticated identity the system does not yet know is recorded as pending and
-- granted nothing.

create or replace function fn_link_identity(
  p_auth_id uuid, p_email text, p_full_name text default null, p_provider text default 'password')
returns uuid
language plpgsql
security definer
as $$
declare v_user uuid; v_tenant uuid; v_status text; v_provider text;
begin
  if p_email is null or btrim(p_email) = '' then return null; end if;
  -- app_user_identities.provider is constrained to google|password.
  v_provider := coalesce(nullif(btrim(p_provider), ''), 'password');

  -- already linked: the ordinary case after the first sign-in
  select app_user_id into v_user from app_user_identities
   where provider = v_provider and provider_user_id = p_auth_id;
  if v_user is not null then
    update app_users set last_sign_in_at = now() where id = v_user and status = 'active';
    return (select u.id from app_users u where u.id = v_user and u.status = 'active');
  end if;

  -- the person's own record IS the auth user (invited, or created with this id)
  select id, tenant_id, status into v_user, v_tenant, v_status from app_users where id = p_auth_id;
  if v_user is null then
    -- or an address an admin pre-registered against a staff record
    select id, tenant_id, status into v_user, v_tenant, v_status from app_users
     where lower(coalesce(google_email, email)) = lower(btrim(p_email));
  end if;

  if v_user is null then
    -- Nobody knows this address. Record the request; grant nothing.
    select id into v_tenant from tenants order by created_at limit 1;
    insert into app_users (id, tenant_id, full_name, email, google_email, status)
      values (p_auth_id, v_tenant, nullif(btrim(coalesce(p_full_name, '')), ''),
              lower(btrim(p_email)),
              case when v_provider = 'google' then lower(btrim(p_email)) end,
              'pending')
    on conflict (id) do nothing;
    insert into app_user_identities (tenant_id, app_user_id, provider, provider_user_id, email)
      values (v_tenant, p_auth_id, v_provider, p_auth_id, lower(btrim(p_email)))
    on conflict (provider, provider_user_id) do nothing;
    return null;                       -- pending: no session, no data
  end if;

  insert into app_user_identities (tenant_id, app_user_id, provider, provider_user_id, email)
    values (v_tenant, v_user, v_provider, p_auth_id, lower(btrim(p_email)))
  on conflict (provider, provider_user_id) do nothing;

  if v_status <> 'active' then return null; end if;
  update app_users set last_sign_in_at = now() where id = v_user;
  return v_user;
end $$;

comment on function fn_link_identity(uuid, text, text, text) is
  'Any first-time authenticated identity — Google or password — is recorded as PENDING and returns null: no session, no data, until a human approves it. Supersedes fn_link_google_identity, which now delegates here.';

-- The Google entry point stays, delegating, so nothing that calls it breaks.
create or replace function fn_link_google_identity(p_auth_id uuid, p_email text, p_full_name text default null)
returns uuid
language plpgsql
security definer
as $$
begin
  return fn_link_identity(p_auth_id, p_email, p_full_name, 'google');
end $$;

grant execute on function fn_link_identity(uuid, text, text, text) to mop_app;
grant execute on function fn_link_google_identity(uuid, text, text) to mop_app;
