-- 066_team_lead_role.sql
-- Role structure per DOCUMENT 9 §A (ROADMAP §7.1): TEAM LEAD as a first-class role,
-- and pre-flight submission gated to team leads — previously ANY linked technician
-- could submit a pre-flight (the exact gap the owner named).
--
-- Adds:
--   * permission `preflight.submit` — granted to admin, management, operations, team_lead
--   * role `team_lead` — everything technician has, plus preflight.submit and
--     inventory.view (declares the van stock they hold)
--   * technicians.is_team_lead flag (owner marks the leads; users screen can also
--     assign the team_lead role to their login)
--   * DB-layer enforcement: a BEFORE INSERT trigger on preflight_checks refuses an
--     APPLICATION insert (an actor is set in app.current_actor) whose actor neither
--     holds preflight.submit nor is a team-lead technician. Maintenance paths
--     (migrations/seeds/tests run without an actor) are unaffected. This enforces
--     the boundary IN the database, not by hiding UI (DOCUMENT 9 §A).
--
-- No structural invariant touched: preflight_checks stays an upsertable capture
-- table (not append-only); RLS tenant isolation unchanged; roles/permissions are
-- editable reference data (mig 039 catalogue extended by one code).

-- 1. Permission
insert into permissions (code, description)
values ('preflight.submit', 'Submit the team pre-flight (attendance, vehicle, fuel, stock declaration)')
on conflict (code) do nothing;

-- 2. Team-lead flag on technicians
alter table technicians add column if not exists is_team_lead boolean not null default false;

-- 3. Role + grants (per tenant, like mig 039)
do $$
declare
  v_tenant uuid; v_role uuid;
begin
  for v_tenant in select id from tenants loop
    insert into roles (tenant_id, code, name)
    values (v_tenant, 'team_lead', 'Team Lead')
    on conflict do nothing;
    select id into v_role from roles where tenant_id = v_tenant and code = 'team_lead';
    if v_role is null then continue; end if;

    -- technician's grants + preflight.submit + inventory.view
    insert into role_permissions (tenant_id, role_id, permission_code)
    select v_tenant, v_role, x.code
      from (values ('job.view'), ('service_report.file'), ('expense.record'),
                   ('preflight.submit'), ('inventory.view')) as x(code)
    on conflict do nothing;

    -- office roles that legitimately submit/correct a pre-flight
    insert into role_permissions (tenant_id, role_id, permission_code)
    select v_tenant, r.id, 'preflight.submit'
      from roles r
     where r.tenant_id = v_tenant and r.code in ('admin', 'management', 'operations')
    on conflict do nothing;
  end loop;
end $$;

-- 4. DB-layer gate on pre-flight submission.
create or replace function enforce_preflight_authority()
returns trigger language plpgsql as $$
declare
  v_actor uuid;
  v_ok boolean;
begin
  -- Application requests always set app.current_actor (withRequest). Maintenance
  -- paths (migrations, seeds, SQL tests) run without one and are not gated here.
  begin
    v_actor := nullif(current_setting('app.current_actor', true), '')::uuid;
  exception when others then
    v_actor := null;
  end;
  if v_actor is null then return new; end if;

  select exists (
    -- actor holds preflight.submit through any of their roles
    select 1
      from user_roles ur
      join role_permissions rp on rp.role_id = ur.role_id
     where ur.user_id = v_actor and ur.tenant_id = new.tenant_id
       and rp.permission_code = 'preflight.submit'
  ) or exists (
    -- or the actor's linked technician is a team lead
    select 1 from technicians t
     where t.tenant_id = new.tenant_id and t.user_id = v_actor and t.is_team_lead
  ) into v_ok;

  if not v_ok then
    raise exception 'preflight.submit denied: only a team lead (or operations/admin) may submit the pre-flight';
  end if;
  return new;
end $$;

-- Gate both the first submission and the same-day correction (the app upserts).
drop trigger if exists preflight_checks_authority on preflight_checks;
create trigger preflight_checks_authority
  before insert or update on preflight_checks
  for each row execute function enforce_preflight_authority();
