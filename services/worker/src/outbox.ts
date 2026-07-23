// Transactional outbox: emit events inside the business transaction, and drain
// them to idempotent consumers. Exactly-once is guaranteed by the
// (consumer_name, event_id) primary key on event_consumers: the guard insert and
// the handler side effect commit in the SAME transaction, so a replay is a no-op.
import type { Pool, PoolClient } from "pg";
import { parseEvent, type EventType } from "@mop/domain";

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
}

export interface DrainResult {
  scanned: number;
  dispatched: number;
}

// Drain all currently-unprocessed events once.
export async function drainOnce(pool: Pool, consumers: Consumer[]): Promise<DrainResult> {
  const { rows: events } = await pool.query(
    `select * from outbox_events where processed_at is null order by occurred_at asc limit 500`,
  );
  let dispatched = 0;

  for (const ev of events) {
    for (const c of consumers) {
      const client = await pool.connect();
      try {
        await client.query("begin");
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
        await client.query("rollback");
        // Leave no consumer row: the event stays unprocessed and is retried on
        // the next drain. Record the attempt on the outbox for visibility.
        await pool.query(`update outbox_events set attempts = attempts + 1 where event_id = $1`, [
          ev.event_id,
        ]);
        console.error(`[outbox] consumer "${c.name}" failed on ${ev.event_id}:`, (err as Error).message);
      } finally {
        client.release();
      }
    }

    // Mark the event processed once every registered consumer has a processed row.
    await pool.query(
      `update outbox_events set processed_at = now()
        where event_id = $1
          and (select count(*) from event_consumers
                where event_id = $1 and status = 'processed') = $2`,
      [ev.event_id, consumers.length],
    );
  }

  return { scanned: events.length, dispatched };
}
