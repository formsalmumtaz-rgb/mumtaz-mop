-- 017_item_reorder_level.sql
-- Chemical master (ops-console Stage 1) needs a reorder level so Stage 2 can
-- raise low-stock alerts. Held in the item's base unit (see items.base_unit_id).
-- Additive, nullable; touches no ledger/append-only table; no invariant relaxed.
alter table items add column reorder_level numeric check (reorder_level is null or reorder_level >= 0);
