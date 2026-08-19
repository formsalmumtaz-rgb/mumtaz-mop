-- 098_customer_group_matching.sql
-- How an imported group name is reconciled with a group that already exists.
--
-- The master file writes "SULTAN ALARAB GROUP"; the live group created on
-- 28 Jul 2026 is named "Sultan Al Arab". These are the same group written two
-- ways, and importing the file must attach to the existing one rather than
-- create a near-duplicate beside it.
--
-- The rule is deliberately narrow: case, spaces, punctuation and a trailing
-- "GROUP" are not meaning. Anything beyond that — abbreviations, misspellings,
-- reordered words — is NOT matched here. It is reported in the dry-run report and
-- a human decides (Art. X §4). This is normalisation, not fuzzy matching: no two
-- differently-spelled names are ever folded together.
--
--   'SULTAN ALARAB GROUP' -> 'SULTANALARAB'
--   'Sultan Al Arab'      -> 'SULTANALARAB'   (same group, attaches)
--   'AL ATLAL ROASTRY GROUP' -> 'ALATLALROASTRY' (matches nothing else)
create or replace function fn_group_key(p_name text) returns text
language sql immutable as $$
  select regexp_replace(
           regexp_replace(upper(coalesce(p_name, '')), '\s*GROUP\s*$', ''),
           '[^A-Z0-9]', '', 'g')
$$;

comment on function fn_group_key(text) is
  'Normalised customer-group name for reconciliation: case/space/punctuation-insensitive, trailing "GROUP" dropped. Narrow by design — never fuzzy.';

create index if not exists customer_groups_group_key_idx
  on customer_groups (tenant_id, fn_group_key(name));
