-- 054_field_event_provenance.sql
-- Technician app T1 foundation: event provenance for offline field mutations.
--
-- Art. VII §4 (binding): offline records store BOTH the device timestamp and the
-- server receipt timestamp; reports use device time, audit uses both. And the
-- login actor must be stamped on every queued mutation (DECISIONS §11.5).
--
-- Two independent review signals:
--   time_suspect  — the device clock looks implausible (future / wildly behind).
--                   Informational: the event STILL processes, but is flagged so
--                   reports/review can see it. Never silently accepted.
--   needs_review  — the event arrived from a login that was revoked
--                   (is_active=false) after the work was done offline. HELD: the
--                   drain skips it so it does not auto-post to the ledger/inventory
--                   until an admin approves. Never silently discarded.

alter table outbox_events
  add column if not exists device_time        timestamptz,
  add column if not exists server_received_at  timestamptz not null default now(),
  add column if not exists time_suspect        boolean not null default false,
  add column if not exists needs_review        boolean not null default false,
  add column if not exists review_reason       text;

-- Held events (needs_review) are the ones an admin must action; index for the
-- drain's skip and the dashboard count.
create index if not exists outbox_events_needs_review_idx
  on outbox_events (tenant_id) where needs_review;

comment on column outbox_events.device_time is 'Device (phone) clock at event creation — offline. Reports use this (Art. VII §4).';
comment on column outbox_events.server_received_at is 'Server clock when the event was ingested at sync (Art. VII §4).';
comment on column outbox_events.time_suspect is 'Device clock implausible vs server; event still processes, flagged for review.';
comment on column outbox_events.needs_review is 'Arrived from a revoked login; held from the drain until an admin approves.';
