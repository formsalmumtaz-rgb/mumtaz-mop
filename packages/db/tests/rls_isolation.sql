-- rls_isolation.sql — RLS tenant-isolation test (Constitution Art. V §5).
-- Wrapped in ONE transaction that ROLLS BACK, so it leaves no data behind and
-- cleans up correctly even though some tables are append-only (item_purchases)
-- or version-immutable (employee_cost_components) and cannot be deleted.
-- PASS = final row 'RLS ISOLATION TEST PASSED'; any failure raises. Run e.g.:
--   psql "$DATABASE_URL" -f packages/db/tests/rls_isolation.sql
-- (009_rls grants mop_app to postgres, so the pooled postgres role can run it.)

begin;
do $$
declare
  t_a uuid; t_b uuid; c_a uuid; c_b uuid; g_a uuid;
  s_a uuid; it_a uuid; ib_a uuid; ip_a uuid; sl_a uuid; tech_a uuid; cc_a uuid;
  cust_a uuid; job_a uuid; jle_a uuid; jd_a uuid;
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

  -- (5) customer_groups (mig 014) is tenant-isolated too
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

  -- (6) mig 016 inventory tables (suppliers, item_purchases) are isolated too
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

  -- (7) employee_cost_components (mig 019) is tenant-isolated too
  reset role;
  insert into service_lines(tenant_id, code, name) values (t_a, 'pc', 'PC') returning id into sl_a;
  insert into technicians(tenant_id, service_line_id, code, full_name) values (t_a, sl_a, 'T1', 'A Tech') returning id into tech_a;
  insert into employee_cost_components(tenant_id, service_line_id, technician_id, version_no, basic_salary)
    values (t_a, sl_a, tech_a, 1, 1500) returning id into cc_a;
  set local role mop_app;
  perform set_config('app.current_tenant', t_b::text, true);
  perform 1 from employee_cost_components where id = cc_a;
  if found then raise exception 'RLS FAIL: tenant B can see tenant A cost components'; end if;
  blocked := false;
  begin
    insert into employee_cost_components(tenant_id, service_line_id, technician_id, version_no, basic_salary)
      values (t_a, sl_a, tech_a, 2, 1);
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'RLS FAIL: cross-tenant cost-component insert allowed'; end if;

  -- (8) cost capture tables (mig 021): job_labour_entries + job_distance isolated
  reset role;
  insert into customers(tenant_id, service_line_id, trade_name) values (t_a, sl_a, 'A-Cust2') returning id into cust_a;
  insert into jobs(tenant_id, service_line_id, customer_id, status) values (t_a, sl_a, cust_a, 'completed') returning id into job_a;
  insert into job_labour_entries(tenant_id, service_line_id, job_id, technician_id, minutes) values (t_a, sl_a, job_a, tech_a, 60) returning id into jle_a;
  insert into job_distance(tenant_id, service_line_id, job_id, distance_km, source) values (t_a, sl_a, job_a, 12.5, 'manual') returning id into jd_a;
  set local role mop_app;
  perform set_config('app.current_tenant', t_b::text, true);
  perform 1 from job_labour_entries where id = jle_a;
  if found then raise exception 'RLS FAIL: tenant B can see tenant A labour entry'; end if;
  perform 1 from job_distance where id = jd_a;
  if found then raise exception 'RLS FAIL: tenant B can see tenant A distance'; end if;
  blocked := false;
  begin
    insert into job_distance(tenant_id, service_line_id, job_id, distance_km, source) values (t_a, sl_a, job_a, 1, 'manual');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'RLS FAIL: cross-tenant distance insert allowed'; end if;

  reset role;
  raise notice 'RLS ISOLATION checks passed';
end $$;
select 'RLS ISOLATION TEST PASSED (non-privileged role: 8 checks — customers, groups, inventory, employee cost, cost capture)' as result;
rollback;
