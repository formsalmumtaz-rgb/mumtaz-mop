-- 136_equipment_is_counted_not_ticked.sql
-- The evening equipment check was comparing against TICKS. A tick says "the
-- sprayer was present"; it does not say how many sprayers left the yard, so
-- three going out and two coming back reconciled perfectly. The chemical side
-- has been counted out and counted back since 133 — equipment now works the
-- same way, because a count is a record and a tick is an opinion.
--
-- The vocabulary does not change: preflight_checklist_items (kind='equipment')
-- stays the single list of what a van carries. What changes is that each line
-- now carries a NUMBER at both ends of the day.

create table if not exists preflight_equipment_counts (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  preflight_check_id  uuid not null references preflight_checks(id) on delete cascade,
  equipment_code      text not null,
  qty_out             integer not null check (qty_out >= 0),
  note                text,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  unique (preflight_check_id, equipment_code)
);

create table if not exists postflight_equipment_counts (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id),
  postflight_check_id  uuid not null references postflight_checks(id) on delete cascade,
  equipment_code       text not null,
  qty_back             integer not null check (qty_back >= 0),
  note                 text,
  created_at           timestamptz not null default now(),
  created_by           uuid,
  unique (postflight_check_id, equipment_code)
);

create index if not exists preflight_equip_code_idx  on preflight_equipment_counts  (tenant_id, equipment_code);
create index if not exists postflight_equip_code_idx on postflight_equipment_counts (tenant_id, equipment_code);

comment on table preflight_equipment_counts is
  'How many of each piece of kit LEFT THE YARD, per van per day. The morning half of the equipment reconciliation; the tick in preflight_checks.equipment is kept in step but is no longer the record.';
comment on table postflight_equipment_counts is
  'How many of each piece of kit CAME BACK. Compared against the morning count by technician_day_equipment_reconciliation.';

alter table preflight_equipment_counts  enable row level security;
alter table postflight_equipment_counts enable row level security;
drop policy if exists tenant_isolation on preflight_equipment_counts;
create policy tenant_isolation on preflight_equipment_counts
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
drop policy if exists tenant_isolation on postflight_equipment_counts;
create policy tenant_isolation on postflight_equipment_counts
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());

-- Correctable until the day is confirmed, exactly like the chemical count.
grant select, insert, update, delete on preflight_equipment_counts  to mop_app;
grant select, insert, update, delete on postflight_equipment_counts to mop_app;

-- A confirmed day freezes the evening count with everything else it covers (135).
create or replace function enforce_postflight_equipment_frozen() returns trigger
language plpgsql as $$
declare v_confirmed boolean; v_date date;
begin
  select p.accountability_confirmed, p.check_date into v_confirmed, v_date
    from postflight_checks p
   where p.id = coalesce(new.postflight_check_id, old.postflight_check_id);
  -- No parent means the parent is being deleted and this is the cascade.
  if not found then return coalesce(new, old); end if;
  if v_confirmed then
    raise exception
      'The equipment count for % is part of a day that has been confirmed. It cannot be changed.', v_date;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists postflight_equipment_frozen on postflight_equipment_counts;
create trigger postflight_equipment_frozen
  before insert or update or delete on postflight_equipment_counts
  for each row execute function enforce_postflight_equipment_frozen();

-- ── Did the kit come back? ─────────────────────────────────────────────
-- Unlike chemical, nothing is consumed: what went out is what should return.
-- A negative is kit left on a site; a positive is kit picked up during the day,
-- which is a real thing that happens and is worth seeing rather than hiding.
create or replace view technician_day_equipment_reconciliation as
  select coalesce(pre.tenant_id, post.tenant_id)         as tenant_id,
         coalesce(pre.technician_id, post.technician_id) as technician_id,
         coalesce(pre.check_date, post.check_date)       as check_date,
         coalesce(pre.equipment_code, post.equipment_code) as equipment_code,
         ci.label,
         coalesce(pre.qty, 0) as went_out,
         post.qty             as came_back,
         case when post.qty is not null then post.qty - coalesce(pre.qty, 0) end as difference
    from (
      select pc.tenant_id, pc.technician_id, pc.check_date, e.equipment_code, sum(e.qty_out)::int as qty
        from preflight_equipment_counts e
        join preflight_checks pc on pc.id = e.preflight_check_id
       group by pc.tenant_id, pc.technician_id, pc.check_date, e.equipment_code
    ) pre
    full outer join (
      select pc.tenant_id, pc.technician_id, pc.check_date, e.equipment_code, sum(e.qty_back)::int as qty
        from postflight_equipment_counts e
        join postflight_checks pc on pc.id = e.postflight_check_id
       group by pc.tenant_id, pc.technician_id, pc.check_date, e.equipment_code
    ) post
      on  post.tenant_id = pre.tenant_id and post.technician_id = pre.technician_id
      and post.check_date = pre.check_date and post.equipment_code = pre.equipment_code
    left join preflight_checklist_items ci
      on  ci.tenant_id = coalesce(pre.tenant_id, post.tenant_id)
      and ci.kind = 'equipment'
      and ci.code = coalesce(pre.equipment_code, post.equipment_code);

comment on view technician_day_equipment_reconciliation is
  'Per technician per day per item of kit: how many went out, how many came back, and the difference. Null came_back means the day was not closed with a count.';

grant select on technician_day_equipment_reconciliation to mop_app;
