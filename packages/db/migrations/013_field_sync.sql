-- 013_field_sync.sql
-- MOP K4 — sync-up from the offline field app. The device's client-generated UUID
-- (Art. VII §4) becomes the server-side idempotency key: re-posting an event that
-- already landed (e.g. after a mid-sync drop or a lost ack) can never duplicate.

alter table outbox_events add column client_uuid uuid;

-- partial unique: server-emitted events (contract.activated etc.) carry no
-- client_uuid; device events do, and dedup on it.
create unique index outbox_events_client_uuid_uniq
  on outbox_events (client_uuid) where client_uuid is not null;
