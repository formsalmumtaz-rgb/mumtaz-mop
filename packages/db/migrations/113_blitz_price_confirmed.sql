-- 113_blitz_price_confirmed.sql
-- RECONSTRUCTED 19 Aug 2026: applied to the database but never written to disk.
-- See D-MIG1.
--
-- Owner confirmed AED 85/L is the actual current price of the concentrate, not an
-- estimate. It is the STANDARD cost and is superseded automatically the moment a
-- real goods receipt gives item_batches.unit_cost.
update settings
   set is_assumed = false, confirmed_at = now(), updated_at = now(),
       description = 'AED 85 per litre of concentrate. Owner-confirmed 19 Aug 2026 as the actual current price. Standard cost: a real goods receipt (item_batches.unit_cost) supersedes it automatically.'
 where key = 'pricing.blitz_price_per_litre';

update items
   set is_assumed = false, confirmed_at = now(), updated_at = now(), assumed_note = null
 where code = 'BLITZ';
