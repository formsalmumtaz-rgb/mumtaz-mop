# Outbox eventing — deployment runbook

Event-driven with a safety net (DECISIONS §2.C). Drain endpoint:
`POST|GET /api/outbox/drain` (idempotent; proven exactly-once, incl. concurrent
pickup, in `services/worker/test/exactly_once.test.ts`). No-op until K2 registers
consumers.

The webhook and pg_cron sweeper need the deployed app's **public URL** and the
`OUTBOX_DRAIN_SECRET`, so they are applied **at deploy, not in dev**.

## 1. Secret
Set `OUTBOX_DRAIN_SECRET` in Vercel env and reference it below.

## 2. Primary — Supabase database webhook (fires in seconds on insert)
Create a trigger on `outbox_events` insert that POSTs to the drain endpoint via
`pg_net`:
```sql
-- run once, post-deploy, with the real URL + secret
create or replace function outbox_notify_drain() returns trigger
language plpgsql security definer as $$
begin
  perform net.http_post(
    url     := 'https://<APP_URL>/api/outbox/drain?source=webhook',
    headers := jsonb_build_object('x-drain-secret', '<OUTBOX_DRAIN_SECRET>'),
    body    := '{}'::jsonb
  );
  return null;
end $$;
create trigger outbox_events_drain
  after insert on outbox_events
  for each row execute function outbox_notify_drain();
```
`pg_net` is async, so the office write is not blocked by the HTTP call.

## 3. Safety net — Supabase pg_cron sweeper (every few minutes)
```sql
select cron.schedule('outbox-sweeper', '*/3 * * * *', $$
  select net.http_get(
    url     := 'https://<APP_URL>/api/outbox/drain?source=sweeper',
    headers := jsonb_build_object('x-drain-secret', '<OUTBOX_DRAIN_SECRET>')
  );
$$);
```
The endpoint logs any events the sweeper finds unprocessed — a rising count means
the webhook is degrading.

## 4. Coarse backstop — Vercel Cron
`apps/ops-console/vercel.json` runs the drain daily (Hobby allows one/day). On
Vercel Pro, tighten to minutes and this can replace the pg_cron sweeper.

## 5. Time-triggered work (added in its phase, not here)
Nightly job generation, renewal reminders, compliance expiry, invoice runs, AR
ageing → Vercel Cron and/or Supabase `pg_cron`. These are genuine schedules, not
event reactions.
