-- 056_outbox_review_bookkeeping.sql
-- The outbox immutability guard (mig 008) freezes event CONTENT and whitelists
-- only the processing-bookkeeping columns (processed_at, attempts) as mutable.
-- T1 adds two more bookkeeping columns that gate processing the same way:
--   needs_review  — held-from-drain flag an admin clears on approval
--   review_reason — the admin's approve/reject note
-- These are NOT event content (type, payload, actor, device_time, server time,
-- time_suspect all stay frozen). This EXTENDS the mutable-bookkeeping whitelist;
-- it does not relax content immutability — the event's substance remains
-- append-only and unchangeable (Art. VII §1 holds).

create or replace function enforce_outbox_content_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'outbox_events is append-only (Art. VII §1): DELETE not permitted.';
  end if;
  if (to_jsonb(new) - 'processed_at' - 'attempts' - 'needs_review' - 'review_reason')
       is distinct from
     (to_jsonb(old) - 'processed_at' - 'attempts' - 'needs_review' - 'review_reason') then
    raise exception 'outbox_events content is immutable; only processing/review bookkeeping may change.';
  end if;
  return new;
end $$;
