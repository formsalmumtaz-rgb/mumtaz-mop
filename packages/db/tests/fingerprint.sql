-- fingerprint.sql — canonical, order-independent schema descriptor.
-- One row per MOP schema element (column / constraint / index / trigger / RLS
-- policy / function), EXCLUDING the postgis extension and its views/tables so the
-- count reflects our schema, not Postgres internals. This is the method used in
-- the reproducibility rebuild.
--
--   psql "$DATABASE_URL" -tA -f packages/db/tests/fingerprint.sql > after.txt
--   diff baseline.txt after.txt        # empty diff == no schema drift
--   wc -l after.txt                    # descriptor count (Baseline v1 = 1315)
select line from (
  select 'col:'||table_name||'.'||column_name||'|'||data_type||'|'||is_nullable||'|'||coalesce(column_default,'') as line
    from information_schema.columns
    where table_schema='public' and table_name not in ('spatial_ref_sys','geometry_columns','geography_columns')
  union all
  select 'con:'||conrelid::regclass::text||'|'||conname||'|'||pg_get_constraintdef(oid)
    from pg_constraint
    where connamespace='public'::regnamespace and conrelid::regclass::text <> 'spatial_ref_sys'
  union all
  select 'idx:'||tablename||'|'||indexname||'|'||indexdef
    from pg_indexes where schemaname='public' and tablename <> 'spatial_ref_sys'
  union all
  select 'trg:'||event_object_table||'|'||trigger_name||'|'||action_timing||'|'||event_manipulation||'|'||action_statement
    from information_schema.triggers where trigger_schema='public'
  union all
  select 'pol:'||tablename||'|'||policyname||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
    from pg_policies where schemaname='public'
  union all
  select 'fn:'||p.proname||'|'||pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    where p.pronamespace='public'::regnamespace
      and not exists (
        select 1 from pg_depend d join pg_extension e on e.oid=d.refobjid
        where d.objid=p.oid and e.extname='postgis')
) t order by line;
