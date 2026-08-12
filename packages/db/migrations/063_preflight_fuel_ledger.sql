-- 063_preflight_fuel_ledger.sql
-- BLOCKED A7: post pre-flight fuel to the fuel ledger (vehicle_fuel_purchases).
--
-- The pre-flight screen already captures vehicle_id + odometer + fuel litres/AED
-- (mig 058) but never posted a vehicle_fuel_purchases row, because that table had
-- no idempotency key — re-syncing the same day's pre-flight would double-post.
--
-- This adds the idempotency the blocker asked for: a client_uuid and a
-- preflight_check_id, plus a `source` discriminator, and a partial UNIQUE index on
-- preflight_check_id so at most one fuel purchase exists per pre-flight, ever.
--
-- vehicle_fuel_purchases stays APPEND-ONLY (the existing guard is untouched): the
-- posting path INSERTs once and ON CONFLICT DO NOTHING; it never UPDATEs/DELETEs.
-- Adding columns is DDL and does not weaken the append-only invariant. A same-day
-- fuel *correction* on the pre-flight does not rewrite the posted purchase (append-
-- only); the first posted value stands until a manual reversing entry — documented.

alter table vehicle_fuel_purchases
  add column if not exists client_uuid        uuid,
  add column if not exists preflight_check_id uuid references preflight_checks(id),
  add column if not exists source             text not null default 'manual';

-- constrain source (idempotent even if re-run)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicle_fuel_purchases_source_chk') then
    alter table vehicle_fuel_purchases
      add constraint vehicle_fuel_purchases_source_chk check (source in ('manual','preflight'));
  end if;
end $$;

-- one fuel purchase per pre-flight (the idempotency guarantee)
create unique index if not exists vehicle_fuel_purchases_preflight_uniq
  on vehicle_fuel_purchases (preflight_check_id) where preflight_check_id is not null;
