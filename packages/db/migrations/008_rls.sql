-- 008_rls.sql
-- MOP K1 — Row-Level Security (Constitution Art. V §5, Art. VIII). RLS is the
-- in-database backstop: even if the app layer has a bug, a non-privileged role
-- cannot read or write another tenant's rows. Tested with a non-privileged user
-- as a merge condition (packages/db/tests/rls_isolation.sql).
--
-- Tenant context is carried in the session GUC `app.current_tenant`. Privileged
-- roles (postgres, service_role) bypass RLS; the app/test roles do not.

create or replace function app_current_tenant() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_tenant', true), '')::uuid
$$;

-- Enable RLS everywhere and attach the standard tenant policy to every table
-- that has a tenant_id column.
do $$
declare r record;
begin
  for r in
    select c.relname as tbl,
           exists (
             select 1 from information_schema.columns col
             where col.table_schema = 'public'
               and col.table_name = c.relname
               and col.column_name = 'tenant_id'
           ) as has_tenant
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'spatial_ref_sys'
  loop
    execute format('alter table public.%I enable row level security', r.tbl);
    if r.has_tenant then
      execute format(
        'create policy tenant_isolation on public.%I using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant())',
        r.tbl);
    end if;
  end loop;
end $$;

-- tenants: the tenant row is identified by its own id
create policy tenant_isolation on tenants
  using (id = app_current_tenant())
  with check (id = app_current_tenant());

-- event_consumers has no tenant_id: isolate via its parent event
create policy tenant_isolation on event_consumers
  using (exists (select 1 from outbox_events o
                 where o.event_id = event_consumers.event_id
                   and o.tenant_id = app_current_tenant()))
  with check (exists (select 1 from outbox_events o
                      where o.event_id = event_consumers.event_id
                        and o.tenant_id = app_current_tenant()));

-- Non-privileged role used to PROVE isolation (and the future app-layer grant
-- target). NOLOGIN: reached via SET ROLE from an authenticated session.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mop_app') then
    create role mop_app nologin;
  end if;
end $$;
grant usage on schema public to mop_app;
grant select, insert, update, delete on all tables in schema public to mop_app;
-- allow the app/superuser role to SET ROLE down into mop_app (RLS still applies once switched)
grant mop_app to postgres;
