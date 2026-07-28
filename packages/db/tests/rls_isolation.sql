-- rls_isolation.sql — RLS tenant-isolation test (Constitution Art. V §5).
-- Runs entirely inside one transaction and cleans up after itself.
-- PASS = completes with the final row 'RLS ISOLATION TEST PASSED'; any failure
-- raises an exception. Run with a role that can SET ROLE mop_app, e.g.:
--   psql "$DATABASE_URL" -f packages/db/tests/rls_isolation.sql
-- (008_rls grants mop_app to postgres, so the pooled postgres role can run it.)

do $$
declare
  t_a uuid; t_b uuid; c_a uuid; c_b uuid; g_a uuid;
  s_a uuid; it_a uuid; ib_a uuid; ip_a uuid;
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

  -- (5) customer_groups (mig 014) is tenant-isolated too. Prove with the same
  -- non-privileged role: a group created under A is invisible under B, and a
  -- cross-tenant group insert is blocked by WITH CHECK.
  reset role;
  insert into customer_groups(tenant_id, name) values (t_a, 'A-Group') returning id into g_a;
  set local role mop_app;
  perform set_config('app.current_tenant', t_b::text, true);
  perform 1 from customer_groups where id = g_a;
  if found then raise exception 'RLS FAIL: tenant B can see tenant A group'; end if;
  blocked := false;
  begin
    insert into customer_groups(tenant_id, name) values (t_a, 'cross-tenant group');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'RLS FAIL: cross-tenant group insert allowed'; end if;

  -- (6) mig 016 new tenant-scoped tables (suppliers, item_purchases) are isolated
  -- too. Prove with the same non-privileged role: A's rows are invisible under B,
  -- and a cross-tenant supplier insert is blocked by WITH CHECK.
  reset role;
  insert into suppliers(tenant_id, name) values (t_a, 'A-Supplier') returning id into s_a;
  insert into items(tenant_id, name, item_type) values (t_a, 'A-Chem', 'chemical') returning id into it_a;
  insert into item_batches(tenant_id, item_id, batch_no, unit_cost) values (t_a, it_a, 'A-BATCH', 0.01) returning id into ib_a;
  insert into item_purchases(tenant_id, item_id, batch_id, pack_quantity, pack_size, total_base_quantity, total_cost)
    values (t_a, it_a, ib_a, 1, 10, 10000, 100) returning id into ip_a;
  set local role mop_app;
  perform set_config('app.current_tenant', t_b::text, true);
  perform 1 from suppliers where id = s_a;
  if found then raise exception 'RLS FAIL: tenant B can see tenant A supplier'; end if;
  perform 1 from item_purchases where id = ip_a;
  if found then raise exception 'RLS FAIL: tenant B can see tenant A purchase'; end if;
  blocked := false;
  begin
    insert into suppliers(tenant_id, name) values (t_a, 'cross-tenant supplier');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'RLS FAIL: cross-tenant supplier insert allowed'; end if;

  reset role;                                      -- back to privileged for cleanup
  delete from item_purchases where id = ip_a;
  delete from item_batches where id = ib_a;
  delete from items where id = it_a;
  delete from suppliers where id = s_a;
  delete from customer_groups where id = g_a;
  delete from customers where id in (c_a, c_b);
  delete from tenants where id in (t_a, t_b);
end $$;
select 'RLS ISOLATION TEST PASSED (non-privileged role: 6 checks incl. customer_groups + mig-016 inventory)' as result;
