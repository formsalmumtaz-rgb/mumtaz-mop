-- 132_technician_van_is_one_rule.sql
-- "Which van is this technician's?" was answered three different ways:
--   · the pre-flight and the field sync matched a stock location whose NAME is
--     the team name with " Van" appended;
--   · the stock deducter matched location_type='van' AND technician_id;
--   · nothing reconciled the two.
-- So renaming a team silently emptied the pre-flight stock list while the
-- consumption path kept working, and a van pinned to a technician rather than a
-- team was invisible to the pre-flight. Both are the kind of quiet wrong that
-- only shows up as a stock figure nobody trusts.
--
-- One rule, in one place: the technician's own van if there is one, else their
-- team's van by the naming convention. Everything asks this function.

create or replace function fn_technician_van(p_tenant uuid, p_technician uuid)
returns uuid
language sql stable as $$
  select coalesce(
    -- a van pinned to this technician wins: it is the most specific statement
    (select sl.id from stock_locations sl
      where sl.tenant_id = p_tenant and sl.location_type = 'van'
        and sl.technician_id = p_technician and coalesce(sl.is_active, true)
      order by sl.created_at limit 1),
    -- else the team's van, by the "<team> Van" convention seeded in 065
    (select sl.id from team_assignments ta
       join teams tm on tm.id = ta.team_id
       join stock_locations sl on sl.tenant_id = ta.tenant_id and sl.name = tm.name || ' Van'
      where ta.tenant_id = p_tenant and ta.technician_id = p_technician
        and ta.effective_to is null and coalesce(sl.is_active, true)
      order by sl.created_at limit 1)
  )
$$;

comment on function fn_technician_van(uuid, uuid) is
  'The stock location that is this technician''s van: their own pinned van first, else their team''s "<team> Van". The single answer — the pre-flight, the field sync and the consumption path all read it, so they cannot disagree.';

grant execute on function fn_technician_van(uuid, uuid) to mop_app;
