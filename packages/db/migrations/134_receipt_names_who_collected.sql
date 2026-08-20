-- 134_receipt_names_who_collected.sql
-- The day-close summary shows the supervisor the cash taken today and then asks
-- them to sign that it is true. It could not: a receipt records the customer,
-- the amount and the method, but never WHO took the money. Cash collected at a
-- door by a technician and cash banked by the office were indistinguishable the
-- moment the event drained.
--
-- Asking someone to put their name to a figure the system cannot attribute is
-- the wrong way round. The receipt now names the technician when a technician
-- collected it, and stays null when the office did.

alter table receipts add column if not exists collected_by_technician_id uuid references technicians(id);

comment on column receipts.collected_by_technician_id is
  'The technician who physically took the money, when it was collected in the field. Null for office-received payments. Set from the cash.collected event''s actor — never typed.';

create index if not exists receipts_collected_by_idx
  on receipts (tenant_id, collected_by_technician_id, receipt_date)
  where collected_by_technician_id is not null;

-- fn_record_receipt is the only sanctioned way a receipt is created (Art. VII).
-- Rather than widen its signature and every caller with it, the collector is
-- stamped by the cash-collector consumer immediately after, inside the same
-- transaction. The column is additive: nothing that exists changes meaning.
