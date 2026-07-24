-- Canonical, order-independent schema description (one sorted line per object).
select line from (
  select 'col:'||table_name||'.'||column_name||'|'||data_type||'|'||is_nullable||'|'||coalesce(column_default,'') line
    from information_schema.columns where table_schema='public' and table_name<>'spatial_ref_sys'
  union all
  select 'con:'||conrelid::regclass::text||'|'||conname||'|'||pg_get_constraintdef(oid)
    from pg_constraint where connamespace='public'::regnamespace and conrelid::regclass::text<>'spatial_ref_sys'
  union all
  select 'idx:'||tablename||'|'||indexname||'|'||indexdef
    from pg_indexes where schemaname='public' and tablename<>'spatial_ref_sys'
  union all
  select 'trg:'||event_object_table||'|'||trigger_name||'|'||action_timing||'|'||event_manipulation||'|'||action_statement
    from information_schema.triggers where trigger_schema='public'
  union all
  select 'pol:'||tablename||'|'||policyname||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
    from pg_policies where schemaname='public'
  union all
  select 'fn:'||proname||'|'||pg_get_function_identity_arguments(oid)
    from pg_proc where pronamespace='public'::regnamespace
) t order by line;
