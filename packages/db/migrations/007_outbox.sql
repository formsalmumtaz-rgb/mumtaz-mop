-- 007_outbox.sql
-- MOP K1 — transactional outbox (Constitution Art. VII §1). Business write and
-- event insert happen in the SAME transaction. Events are append-only in content
-- and replayable; consumers are idempotent, keyed by (consumer_name, event_id).

create table outbox_events (
  event_id       uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  event_type     text not null,                       -- e.g. 'contract.activated'
  aggregate_type text,                                -- 'contract','job',...
  entity_id      uuid,
  payload        jsonb not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now(),
  actor_id       uuid,
  source_device  text,
  -- processing bookkeeping (the only mutable columns):
  processed_at   timestamptz,                         -- set when all consumers have handled it
  attempts       integer not null default 0,
  created_at     timestamptz not null default now()
);
-- fast "what's unprocessed" scan for the drain loop
create index outbox_unprocessed_idx on outbox_events (occurred_at) where processed_at is null;
create index outbox_type_idx on outbox_events (event_type);

-- Content is immutable; only processed_at/attempts may change; never deleted.
create or replace function enforce_outbox_content_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'outbox_events is append-only (Art. VII §1): DELETE not permitted.';
  end if;
  if (to_jsonb(new) - 'processed_at' - 'attempts') is distinct from (to_jsonb(old) - 'processed_at' - 'attempts') then
    raise exception 'outbox_events content is immutable; only processed_at/attempts may change.';
  end if;
  return new;
end $$;
create trigger outbox_events_immutable before update or delete on outbox_events
  for each row execute function enforce_outbox_content_immutable();

-- Idempotency ledger: one row per (consumer, event). The primary key is the
-- exactly-once guarantee — a consumer cannot record the same event twice.
create table event_consumers (
  consumer_name text not null,
  event_id      uuid not null references outbox_events(event_id),
  status        text not null default 'processed' check (status in ('processed','failed')),
  attempts      integer not null default 1,
  processed_at  timestamptz not null default now(),
  error         text,
  primary key (consumer_name, event_id)
);
create index event_consumers_event_idx on event_consumers (event_id);
