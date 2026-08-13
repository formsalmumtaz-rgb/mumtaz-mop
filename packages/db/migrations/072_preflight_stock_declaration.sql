-- 072_preflight_stock_declaration.sql
-- Declared stock at pre-flight (DOCUMENT 8 Part E/F — "control through knowledge,
-- not restriction"). The team lead declares what the van physically holds; the
-- system records it and COMPARES against the issued ledger. It never blocks, never
-- rejects an implausible figure — variance is a management signal, not a lock.
--
--   * preflight_stock_declarations — declared quantities per item, hanging off the
--     pre-flight (which mig 066 already gates to team leads at DB+API layer).
--   * preflight_stock_variance — declared vs on-hand (batch_stock_on_hand summed
--     to the technician's van location) at a glance. Deterministic view, no state.
--
-- Invariants untouched: declarations are capture rows (mutable same-day, like the
-- pre-flight itself); the stock ledger is not written here at all.

create table if not exists preflight_stock_declarations (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id),
  preflight_check_id uuid not null references preflight_checks(id) on delete cascade,
  item_id            uuid not null references items(id),
  declared_qty_base  numeric not null check (declared_qty_base >= 0),
  note               text,
  created_at         timestamptz not null default now(), created_by uuid,
  unique (preflight_check_id, item_id)
);
alter table preflight_stock_declarations enable row level security;
drop policy if exists tenant_isolation on preflight_stock_declarations;
create policy tenant_isolation on preflight_stock_declarations
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on preflight_stock_declarations to mop_app;

create or replace view preflight_stock_variance with (security_invoker = true) as
select d.tenant_id,
       pc.id            as preflight_check_id,
       pc.check_date,
       pc.technician_id,
       t.full_name      as technician,
       d.item_id,
       it.name          as item_name,
       d.declared_qty_base,
       coalesce(oh.qty_base, 0) as issued_on_hand_base,
       d.declared_qty_base - coalesce(oh.qty_base, 0) as variance_base
  from preflight_stock_declarations d
  join preflight_checks pc on pc.id = d.preflight_check_id
  join technicians t on t.id = pc.technician_id
  join items it on it.id = d.item_id
  left join lateral (
    select sum(oh.qty_base) as qty_base
      from batch_stock_on_hand oh
      join stock_locations sl on sl.id = oh.location_id
     where oh.tenant_id = d.tenant_id and oh.item_id = d.item_id
       and sl.location_type = 'van'
       and (sl.technician_id = pc.technician_id
            or sl.id = (select v.stock_location_id from vehicles v where v.id = pc.vehicle_id))
  ) oh on true;
grant select on preflight_stock_variance to mop_app;
