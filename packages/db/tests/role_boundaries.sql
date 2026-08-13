-- role_boundaries.sql — NEGATIVE tests for the role structure (DOCUMENT 9 §A,
-- mig 039 + 066). Proves the boundaries hold in the DATABASE, not by hidden UI:
--   1. permission-matrix assertions on the seeded Mumtaz roles
--   2. behavioral: a plain technician actor CANNOT insert/update a pre-flight
--      (trigger preflight_checks_authority); a team-lead actor CAN; an actor
--      holding preflight.submit via a role CAN.
-- Wrapped in one transaction that ROLLS BACK. PASS = final notice.
begin;
do $$
declare
  v_tenant uuid;
  t uuid; sl uuid;
  tech_plain uuid; tech_lead uuid;
  u_plain uuid := gen_random_uuid();
  u_lead  uuid := gen_random_uuid();
  u_ops   uuid := gen_random_uuid();
  r_ops uuid;
  ok boolean;
  n int;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';

  -- ── 1. Permission matrix (the spec's NEVER list) ─────────────────────────
  -- operations must NEVER hold margin/GL/cost-config/user-management
  select count(*) into n from role_permissions rp
    join roles r on r.id = rp.role_id
   where r.tenant_id = v_tenant and r.code = 'operations'
     and rp.permission_code in ('profit.view','gl.view','settings.manage','user.manage');
  if n <> 0 then raise exception 'MATRIX FAIL: operations holds forbidden permission(s)'; end if;

  -- technician: no financial/customer-master/pricing permissions
  select count(*) into n from role_permissions rp
    join roles r on r.id = rp.role_id
   where r.tenant_id = v_tenant and r.code = 'technician'
     and rp.permission_code in ('profit.view','gl.view','invoice.view','invoice.issue','payment.record',
                                'customer.view','customer.edit','estimate.view','estimate.edit',
                                'settings.manage','user.manage','preflight.submit');
  if n <> 0 then raise exception 'MATRIX FAIL: technician holds forbidden permission(s)'; end if;

  -- finance: no operational scheduling
  select count(*) into n from role_permissions rp
    join roles r on r.id = rp.role_id
   where r.tenant_id = v_tenant and r.code = 'finance' and rp.permission_code in ('job.edit');
  if n <> 0 then raise exception 'MATRIX FAIL: finance can edit jobs'; end if;

  -- viewer: read-only (no *.edit / *.issue / *.record / manage)
  select count(*) into n from role_permissions rp
    join roles r on r.id = rp.role_id
   where r.tenant_id = v_tenant and r.code = 'viewer'
     and (rp.permission_code like '%.edit' or rp.permission_code like '%.issue'
          or rp.permission_code like '%.record' or rp.permission_code like '%.manage'
          or rp.permission_code like '%.approve');
  if n <> 0 then raise exception 'MATRIX FAIL: viewer holds a write permission'; end if;

  -- team_lead: exists and holds preflight.submit; admin+operations hold it too
  select count(*) into n from role_permissions rp
    join roles r on r.id = rp.role_id
   where r.tenant_id = v_tenant and r.code in ('team_lead','admin','operations')
     and rp.permission_code = 'preflight.submit';
  if n < 3 then raise exception 'MATRIX FAIL: preflight.submit not granted to team_lead/admin/operations (found %)', n; end if;

  raise notice 'role matrix: PASS';

  -- ── 2. Behavioral: pre-flight authority trigger ──────────────────────────
  insert into tenants(name) values ('RoleBoundary Test') returning id into t;
  insert into service_lines(tenant_id, code, name) values (t, 'rb_pest', 'RB Pest') returning id into sl;
  insert into app_users(id, tenant_id, full_name, is_active) values
    (u_plain, t, 'Plain Tech', true), (u_lead, t, 'Lead Tech', true), (u_ops, t, 'Ops User', true);
  insert into technicians(tenant_id, service_line_id, full_name, user_id, is_team_lead) values
    (t, sl, 'Plain Tech', u_plain, false) returning id into tech_plain;
  insert into technicians(tenant_id, service_line_id, full_name, user_id, is_team_lead) values
    (t, sl, 'Lead Tech', u_lead, true) returning id into tech_lead;
  -- ops user holds preflight.submit via the operations role of THIS tenant
  insert into roles(tenant_id, code, name) values (t, 'operations', 'Operations') returning id into r_ops;
  insert into role_permissions(tenant_id, role_id, permission_code) values (t, r_ops, 'preflight.submit');
  insert into user_roles(tenant_id, user_id, role_id) values (t, u_ops, r_ops);

  -- (a) PLAIN TECHNICIAN actor → INSERT must be REFUSED
  perform set_config('app.current_actor', u_plain::text, true);
  ok := false;
  begin
    insert into preflight_checks(tenant_id, service_line_id, technician_id) values (t, sl, tech_plain);
  exception when others then ok := true;
  end;
  if not ok then raise exception 'NEGATIVE FAIL: plain technician could submit a pre-flight'; end if;

  -- (b) TEAM LEAD actor → allowed
  perform set_config('app.current_actor', u_lead::text, true);
  insert into preflight_checks(tenant_id, service_line_id, technician_id) values (t, sl, tech_lead);

  -- (c) plain technician cannot UPDATE (correct) the lead's pre-flight either
  perform set_config('app.current_actor', u_plain::text, true);
  ok := false;
  begin
    update preflight_checks set notes = 'tamper' where tenant_id = t and technician_id = tech_lead;
  exception when others then ok := true;
  end;
  if not ok then raise exception 'NEGATIVE FAIL: plain technician could edit the pre-flight'; end if;

  -- (d) permission-holder (operations role) → allowed
  perform set_config('app.current_actor', u_ops::text, true);
  insert into preflight_checks(tenant_id, service_line_id, technician_id, check_date)
    values (t, sl, tech_plain, current_date - 1);

  perform set_config('app.current_actor', '', true);
  raise notice 'preflight authority: PASS (technician refused, lead + permission-holder allowed)';
  raise notice 'ROLE BOUNDARY TESTS PASSED';
end $$;
rollback;
