-- rls_coverage.sql — the fail-closed coverage gate for the A3 role flip.
-- Under the non-privileged mop_app role with NO tenant context, EVERY tenant
-- table must return zero rows. This is what makes the flip safe: if any path
-- forgets to set app.current_tenant (or a table lacks a proper policy), the
-- symptom is empty data, never a cross-tenant leak — and this test catches it.
-- Global, non-tenant catalogues (permissions, spatial_ref_sys) are excluded.
-- PASS = 'RLS COVERAGE PASSED'; any leak raises. Wrapped in a rollback.
begin;
do $$
declare r record; cnt bigint;
begin
  set local role mop_app;
  perform set_config('app.current_tenant', '', true);   -- explicitly NO tenant
  for r in
    select tablename from pg_tables
     where schemaname='public' and tablename not in ('permissions','spatial_ref_sys')
  loop
    execute format('select count(*) from public.%I', r.tablename) into cnt;
    if cnt <> 0 then
      raise exception 'RLS COVERAGE FAIL: %.% returned % rows with NO tenant context', 'public', r.tablename, cnt;
    end if;
  end loop;
  reset role;
  raise notice 'RLS COVERAGE PASSED — every tenant table is empty without tenant context';
end $$;
select 'RLS COVERAGE PASSED' as result;
rollback;
