// K1 EXIT CRITERION (Constitution Phase 0 / EXECUTION.md):
// An event emitted inside a transaction is consumed EXACTLY ONCE by two
// independent handlers, and replaying it changes nothing. Plus: the event is
// atomic with its business write.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { emitEvent, drainOnce, type Consumer } from "../src/outbox.js";

let tenantId: string;

// Two independent handlers writing to a sink WITHOUT a unique constraint — so if
// a handler ran twice, we'd see two rows. Exactly-once means exactly one.
function sinkConsumers(): Consumer[] {
  const insert = (name: string): Consumer => ({
    name,
    handle: async (client, ev) => {
      await client.query(`insert into _k1_test_sink(consumer, event_id) values ($1,$2)`, [
        name,
        ev.envelope.event_id,
      ]);
    },
  });
  return [insert("test_counter_a"), insert("test_counter_b")];
}

before(async () => {
  const { rows } = await pool.query(
    `select id from tenants where name = 'Mumtaz Integrated Services Group' limit 1`,
  );
  tenantId = rows[0].id;
  await pool.query(
    `create table if not exists _k1_test_sink (consumer text, event_id uuid, ts timestamptz default now())`,
  );
  await pool.query(
    `create table if not exists _k1_test_business (id uuid primary key default gen_random_uuid(), note text)`,
  );
});

after(async () => {
  await pool.query(`drop table if exists _k1_test_sink`);
  await pool.query(`drop table if exists _k1_test_business`);
  await pool.end();
});

test("exactly-once delivery to two independent handlers; replay is a no-op", async () => {
  // Clear any backlog from earlier runs, then reset the sink.
  await drainOnce(pool, sinkConsumers());
  await pool.query(`delete from _k1_test_sink`);

  // 1. Emit inside a transaction, atomically with a business write.
  const client = await pool.connect();
  let eventId: string;
  try {
    await client.query("begin");
    await client.query(`insert into _k1_test_business(note) values ('golden thread test')`);
    eventId = await emitEvent(client, {
      tenant_id: tenantId,
      event_type: "job.completed",
      aggregate_type: "job",
      payload: { job_id: randomUUID() },
    });
    await client.query("commit");
  } finally {
    client.release();
  }

  // 2. First drain: each handler runs exactly once.
  const r1 = await drainOnce(pool, sinkConsumers());
  assert.equal(r1.dispatched, 2, "two consumers each dispatched once");

  const countA = async () =>
    (await pool.query(`select count(*)::int n from _k1_test_sink where consumer=$1 and event_id=$2`, ["test_counter_a", eventId])).rows[0].n;
  const countB = async () =>
    (await pool.query(`select count(*)::int n from _k1_test_sink where consumer=$1 and event_id=$2`, ["test_counter_b", eventId])).rows[0].n;

  assert.equal(await countA(), 1, "handler A ran exactly once");
  assert.equal(await countB(), 1, "handler B ran exactly once");

  const proc = await pool.query(`select processed_at from outbox_events where event_id=$1`, [eventId]);
  assert.ok(proc.rows[0].processed_at, "event marked processed after all consumers handled it");

  // 3. Replay: draining again changes nothing.
  const r2 = await drainOnce(pool, sinkConsumers());
  assert.equal(r2.dispatched, 0, "replay dispatches nothing");
  assert.equal(await countA(), 1, "handler A still exactly once after replay");
  assert.equal(await countB(), 1, "handler B still exactly once after replay");
});

test("event is atomic with its business write: rollback leaves no event", async () => {
  const before = (await pool.query(`select count(*)::int n from outbox_events`)).rows[0].n;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await emitEvent(client, {
      tenant_id: tenantId,
      event_type: "job.completed",
      payload: { job_id: randomUUID() },
    });
    await client.query("rollback"); // business write "failed" -> event must not persist
  } finally {
    client.release();
  }
  const after = (await pool.query(`select count(*)::int n from outbox_events`)).rows[0].n;
  assert.equal(after, before, "a rolled-back event leaves no trace in the outbox");
});
