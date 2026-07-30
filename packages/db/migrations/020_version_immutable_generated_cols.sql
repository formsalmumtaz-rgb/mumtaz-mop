-- 020_version_immutable_generated_cols.sql
-- Harden enforce_version_immutable() (003) to support version tables that carry
-- GENERATED columns (introduced by employee_cost_components in 019).
--
-- A BEFORE trigger does not see computed generated-column values — NEW holds null
-- for them — so the original `to_jsonb(new) - 'effective_to' <> to_jsonb(old) ...`
-- comparison flagged a legitimate version-close (setting effective_to) as a value
-- change and blocked it. Fix: exclude the table's generated columns from the
-- comparison. They are derived from the value columns, which remain fully guarded.
--
-- Behaviour is unchanged for every existing version table (none have generated
-- columns → the excluded set is empty). Function body only; no schema descriptors
-- change. No invariant relaxed — value immutability and delete-blocking are intact.

create or replace function enforce_version_immutable() returns trigger
language plpgsql as $$
declare
  gen_cols text[];
  new_j jsonb; old_j jsonb; k text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Version rows are immutable (SCHEMA.md F1): DELETE not permitted on "%".', tg_table_name;
  end if;
  if old.effective_to is not null then
    raise exception 'Version % is already closed and is immutable.', old.id;
  end if;

  -- Generated columns are not populated in a BEFORE trigger; exclude them (plus
  -- effective_to) so only real value-column changes are rejected.
  select coalesce(array_agg(attname), '{}') into gen_cols
    from pg_attribute
   where attrelid = tg_relid and attgenerated <> '' and not attisdropped;

  new_j := to_jsonb(new) - 'effective_to';
  old_j := to_jsonb(old) - 'effective_to';
  foreach k in array gen_cols loop
    new_j := new_j - k;
    old_j := old_j - k;
  end loop;

  if new_j is distinct from old_j then
    raise exception 'Only effective_to may change (to close a version). All value columns are immutable (SCHEMA.md F1).';
  end if;
  return new;
end $$;
