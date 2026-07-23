-- rls_isolation.sql — RLS tenant-isolation test (Constitution Art. V §5).
-- Runs entirely inside one transaction and cleans up after itself.
-- PASS = completes with the final row 'RLS ISOLATION TEST PASSED'; any failure
-- raises an exception. Run with a role that can SET ROLE mop_app, e.g.:
--   psql "$DATABASE_URL" -f packages/db/tests/rls_isolation.sql
-- (008_rls grants mop_app to postgres, so the pooled postgres role can run it.)

do $$
declare
  t_a uuid; t_b uuid; c_a uuid; c_b uuid;
  visible int; blocked boolean;
begin
  insert into tenants(name) values ('RLS Test A') returning id into t_a;
  insert into tenants(name) values ('RLS Test B') returning id into t_b;
  insert into customers(tenant_id, trade_name) values (t_a, 'A-Cust') returning id into c_a;
  insert into customers(tenant_id, trade_name) values (t_b, 'B-Cust') returning id into c_b;

  set local role mop_app;                          -- drop to the non-privileged role

  -- (1) no tenant context -> sees nothing
  select count(*) into visible from customers where id in (c_a, c_b);
  if visible <> 0 then raise exception 'RLS FAIL: no-context saw % (expected 0)', visible; end if;

  -- (2) tenant A context -> only A's row
  perform set_config('app.current_tenant', t_a::text, true);
  select count(*) into visible from customers where id in (c_a, c_b);
  if visible <> 1 then raise exception 'RLS FAIL: tenant A saw % (expected 1)', visible; end if;
  perform 1 from customers where id = c_b;
  if found then raise exception 'RLS FAIL: tenant A can see tenant B row'; end if;

  -- (3) WITH CHECK blocks writing another tenant's row
  blocked := false;
  begin
    insert into customers(tenant_id, trade_name) values (t_b, 'cross-tenant');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'RLS FAIL: cross-tenant insert allowed'; end if;

  -- (4) tenant B context -> cannot see A's row
  perform set_config('app.current_tenant', t_b::text, true);
  perform 1 from customers where id = c_a;
  if found then raise exception 'RLS FAIL: tenant B can see tenant A row'; end if;

  reset role;                                      -- back to privileged for cleanup
  delete from customers where id in (c_a, c_b);
  delete from tenants where id in (t_a, t_b);
end $$;
select 'RLS ISOLATION TEST PASSED (non-privileged role: 4 checks)' as result;
