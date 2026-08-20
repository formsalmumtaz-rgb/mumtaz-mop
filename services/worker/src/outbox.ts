// Transactional outbox: emit events inside the business transaction, and drain
// them to idempotent consumers. Exactly-once is guaranteed by the
// (consumer_name, event_id) primary key on event_consumers: the guard insert and
// the handler side effect commit in the SAME transaction, so a replay is a no-op.
import type { Pool, PoolClient } from "pg";
import { parseEvent, type EventType } from "@mop/domain";
import { bindEnvironment } from "./db";

export interface EmitInput {
  tenant_id: string;
  event_type: EventType;
  aggregate_type?: string | null;
  entity_id?: string | null;
  actor_id?: string | null;
  source_device?: string | null;
  payload?: unknown;
}

// MUST be called with a client already inside the business-write transaction
// (Constitution Art. VII §1) so the event and the write commit atomically.
export async function emitEvent(client: PoolClient, input: EmitInput): Promise<string> {
  const res = await client.query(
    `insert into outbox_events
       (tenant_id, event_type, aggregate_type, entity_id, payload, actor_id, source_device)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning event_id`,
    [
      input.tenant_id,
      input.event_type,
      input.aggregate_type ?? null,
      input.entity_id ?? null,
      JSON.stringify(input.payload ?? {}),
      input.actor_id ?? null,
      input.source_device ?? null,
    ],
  );
  return res.rows[0].event_id as string;
}

export type ParsedEvent = ReturnType<typeof parseEvent>;
export type Handler = (client: PoolClient, event: ParsedEvent) => Promise<void>;
export interface Consumer {
  name: string;
  handle: Handler;
  // Which event types this consumer acts on. Declaring it lets the drain skip
  // the consumer with ZERO database work; every consumer still guards on the
  // type internally, so omitting it is safe (the drain just falls back to
  // claiming and calling, as it always did).
  eventTypes?: readonly EventType[];
}

export interface DrainResult {
  scanned: number;
  dispatched: number;
}

// Drain all currently-unprocessed events once.
export async function drainOnce(
  pool: Pool,
  consumers: Consumer[],
  opts: { tenantId?: string } = {},
): Promise<DrainResult> {
  // No consumers registered yet (pre-K2): do nothing, so events are never marked
  // processed before anyone can handle them. K2 registers the real consumers.
  if (consumers.length === 0) return { scanned: 0, dispatched: 0 };

  // opts.tenantId scopes the drain (tests use a throwaway tenant so they never
  // touch real events). The production endpoint passes no tenant — drains all.
  const { rows: events } = opts.tenantId
    ? await pool.query(
        // not needs_review: events from a revoked login are HELD until an admin
        // approves (clears needs_review), so they never auto-post (T1).
        `select * from outbox_events where processed_at is null and not needs_review and tenant_id = $1 order by occurred_at asc limit 500`,
        [opts.tenantId],
      )
    : await pool.query(
        `select * from outbox_events where processed_at is null and not needs_review order by occurred_at asc limit 500`,
      );
  let dispatched = 0;

  // One connection for the whole drain. Previously a fresh checkout + BEGIN +
  // claim + COMMIT ran for EVERY (event, consumer) pair — 12 events across 13
  // consumers is 156 round trips to the database, which on a remote pooler is
  // ~20 seconds of pure latency and was timing the drain out. Consumers that
  // cannot handle an event are now skipped without touching the database, and
  // the rest share this connection. Exactly-once is untouched: the claim insert
  // and the handler side effect still commit in ONE transaction per pair.
  let client = await pool.connect();
  await bindEnvironment(client);   // costing gate — awaited, before anything else
  const freshClient = async (): Promise<void> => {
    // Only used when the connection itself dies; a rollback on a dead client
    // throws, and continuing with it would fail every remaining event.
    try { client.release(); } catch { /* already gone */ }
    client = await pool.connect();
    await bindEnvironment(client);
  };

  try {
  for (const ev of events) {
    for (const c of consumers) {
      if (c.eventTypes && !c.eventTypes.includes(ev.event_type as EventType)) continue;
      try {
        await client.query("begin");
        // Fail FAST if another session is holding this claim row rather than
        // stalling for the whole statement budget. A killed run leaves a session
        // idle-in-transaction holding an event_consumers PK row; without this the
        // claim below blocks until statement_timeout (~2 min on the pooler), the
        // drain returns having processed nothing, and the caller fails on a wrong
        // VALUE with no hint as to why. With it the drain gives up on this pair in
        // two seconds, records the attempt, logs a lock message, and moves on —
        // the event is retried on the next drain. Exactly-once is untouched: a
        // claim that never committed grants nothing.
        await client.query("set local lock_timeout = '2s'");
        // Claim the (consumer, event) pair. rowCount 1 => first time for this
        // consumer; 0 => already handled, skip (idempotent).
        const claim = await client.query(
          `insert into event_consumers (consumer_name, event_id)
             values ($1,$2)
           on conflict (consumer_name, event_id) do nothing`,
          [c.name, ev.event_id],
        );
        if (claim.rowCount === 1) {
          const occurred =
            ev.occurred_at instanceof Date ? ev.occurred_at.toISOString() : String(ev.occurred_at);
          const parsed = parseEvent({ ...ev, occurred_at: occurred });
          await c.handle(client, parsed); // side effect in the SAME transaction
          dispatched++;
        }
        await client.query("commit");
      } catch (err) {
        // Leave no consumer row: the event stays unprocessed and is retried on
        // the next drain. Record the attempt on the outbox for visibility.
        try {
          await client.query("rollback");
        } catch {
          await freshClient(); // the connection died, not the statement
        }
        await pool.query(`update outbox_events set attempts = attempts + 1 where event_id = $1`, [
          ev.event_id,
        ]);
        const msg = (err as Error).message;
        // Name the environmental case explicitly so a red test is diagnosable at a
        // glance instead of looking like a business-logic bug.
        const contended = /lock timeout|canceling statement due to lock timeout|deadlock detected/i.test(msg);
        console.error(
          `[outbox] consumer "${c.name}" failed on ${ev.event_id}:`, msg,
          contended ? "\n  ^ LOCK CONTENTION, not a logic failure: another session holds this claim row. " +
                      "Check for idle-in-transaction sessions (services/worker/test/_setup.ts clears orphans)." : "");
      }
    }

    // Mark the event processed once every consumer that COULD handle it has a
    // processed row. Counting all registered consumers would leave every event
    // permanently unprocessed now that non-matching ones are skipped — and the
    // outbox would be re-scanned forever.
    const applicable = consumers.filter(
      (c) => !c.eventTypes || c.eventTypes.includes(ev.event_type as EventType),
    ).length;
    // applicable === 0 means nothing registered here can handle this event type.
    // It is deliberately LEFT unprocessed rather than quietly closed off: a
    // consumer added later must still see it. Skipping costs nothing now — the
    // drain no longer opens a transaction per consumer to discover the mismatch.
    if (applicable > 0) {
      await client.query(
        `update outbox_events set processed_at = now()
          where event_id = $1
            and (select count(*) from event_consumers
                  where event_id = $1 and status = 'processed') >= $2`,
        [ev.event_id, applicable],
      );
    }
  }
  } finally {
    client.release();
  }

  return { scanned: events.length, dispatched };
}
