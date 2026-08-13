-- 077_severe_infestation.sql
-- Severe infestation (workflow spec item 5; Unified Contract general condition 6:
-- visits every 3 days until resolved, no additional fees — SOURCED,
-- docs/compliance/). TRACKED, NEVER FORCED:
--   * applies to EXISTING AMC customers only (episode requires an ACTIVE contract);
--   * WE open it manually with the cause recorded — nothing auto-triggers;
--   * fn_suggest_followup_dates OFFERS 3-day dates; the office accepts by creating
--     jobs (source severe_infestation_followup) — a suggestion, never an action;
--   * follow-up visits are zero-revenue, full-cost: contract_severe_cost shows the
--     margin impact per contract;
--   * active episodes surface on the dashboard; a later inspection resolves them.
-- No invariant touched (episodes are operational records; jobs flow unchanged).

create table if not exists severe_infestation_episodes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  contract_id   uuid not null references contracts(id),
  customer_id   uuid not null references customers(id),
  branch_id     uuid references customer_branches(id),
  cause         text not null,                 -- recorded at open, mandatory
  opened_at     timestamptz not null default now(),
  opened_by     uuid,
  resolved_at   timestamptz,
  resolved_note text,
  resolved_by   uuid,
  created_at    timestamptz not null default now()
);
alter table severe_infestation_episodes enable row level security;
drop policy if exists tenant_isolation on severe_infestation_episodes;
create policy tenant_isolation on severe_infestation_episodes
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update on severe_infestation_episodes to mop_app;

-- AMC-only guard: an episode may only open on an ACTIVE contract (protective
-- clause applies to AMC customers, never one-off jobs / prospects)
create or replace function enforce_episode_amc_only()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from contracts ct where ct.id = new.contract_id
                  and ct.tenant_id = new.tenant_id and ct.lifecycle_status = 'active') then
    raise exception 'Severe infestation applies to ACTIVE AMC contracts only';
  end if;
  return new;
end $$;
drop trigger if exists severe_episode_amc_only on severe_infestation_episodes;
create trigger severe_episode_amc_only
  before insert on severe_infestation_episodes
  for each row execute function enforce_episode_amc_only();

-- job source for accepted follow-ups (zero-revenue marker rides the source)
do $$
declare v_t uuid; v_sl uuid;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_t and code = 'pest_control';
  insert into job_sources (tenant_id, service_line_id, code, name)
  select v_t, v_sl, 'severe_infestation_followup', 'Severe infestation follow-up (no fee - clause 6)'
   where not exists (select 1 from job_sources where tenant_id = v_t and code = 'severe_infestation_followup');
end $$;

-- SUGGESTION ONLY: the next N every-3-days dates from the episode start (or from
-- the last accepted follow-up). Pure function — creates nothing.
create or replace function fn_suggest_followup_dates(p_episode uuid, p_count int default 5)
returns setof date language sql stable as $$
  with base as (
    select greatest(
             coalesce((select max(j.scheduled_date) from jobs j
                        where j.attributes->>'severe_episode_id' = p_episode::text), current_date - 3),
             (select opened_at::date - 3 from severe_infestation_episodes where id = p_episode)
           ) as d
  )
  select (select d from base) + (g * 3) from generate_series(1, p_count) g;
$$;
grant execute on function fn_suggest_followup_dates(uuid, int) to mop_app;

-- margin impact: zero-revenue follow-up visits at full cost, per contract
create or replace view contract_severe_cost with (security_invoker = true) as
select e.tenant_id, e.contract_id, e.id as episode_id, e.cause,
       e.opened_at, e.resolved_at, (e.resolved_at is null) as is_active,
       count(j.id) as followup_jobs,
       count(j.id) filter (where j.status = 'completed') as completed_jobs,
       coalesce(sum(jc.total_cost), 0) as cost_absorbed,   -- revenue is 0 by clause
       0::numeric as revenue
  from severe_infestation_episodes e
  left join jobs j on j.attributes->>'severe_episode_id' = e.id::text
  left join job_cost_current jc on jc.job_id = j.id
 group by e.tenant_id, e.contract_id, e.id, e.cause, e.opened_at, e.resolved_at;
grant select on contract_severe_cost to mop_app;

-- allow the episode key on jobs.attributes (field_definitions validator)
insert into field_definitions (tenant_id, service_line_id, entity_type, field_key, label, data_type, is_required, is_assumed)
select t.id, null, 'job', 'severe_episode_id', 'Severe infestation episode', 'text', false, false
  from tenants t where t.name = 'Mumtaz Integrated Services Group'
on conflict do nothing;
