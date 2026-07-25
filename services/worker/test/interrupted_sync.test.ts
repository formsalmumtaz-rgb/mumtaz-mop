// K4 — the guarantee the owner cares most about: sync must be safe when
// INTERRUPTED, not only when it completes. The client UUID is the idempotency key
// end-to-end, so a mid-sync drop or a lost ack (server committed, device never
// heard back) can never double-post. Scoped to a throwaway tenant.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { ingestDeviceEvents } from "../src/index.js";

let tenantId: string, slId: string, jobId: string;

before(async () => {
  const t = await pool.query(`select id from tenants where name='K4 Test Tenant' limit 1`);
  tenantId = t.rows[0]?.id ?? (await pool.query(`insert into tenants(name) values ('K4 Test Tenant') returning id`)).rows[0].id;
  slId = (await pool.query(
    `insert into service_lines(tenant_id, code, name) values ($1,'k4test','K4 Test')
     on conflict (tenant_id, code) do update set name=excluded.name returning id`, [tenantId])).rows[0].id;
  const cust = (await pool.query(
    `insert into customers(tenant_id, service_line_id, trade_name) values ($1,$2,'K4 Cust') returning id`, [tenantId, slId])).rows[0].id;
  jobId = (await pool.query(
    `insert into jobs(tenant_id, service_line_id, customer_id, status) values ($1,$2,$3,'scheduled') returning id`, [tenantId, slId, cust])).rows[0].id;
});

after(async () => {
  await pool.query(`delete from jobs where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from customers where tenant_id=$1`, [tenantId]);
  await pool.end();
});

test("interrupted sync is exactly-once by client_uuid (mid-drop + lost ack)", async () => {
  const mk = (type: string) => ({ client_uuid: randomUUID(), event_type: type, job_id: jobId, payload: { job_id: jobId }, device_time: new Date().toISOString() });
  // a realistic completion burst: start, a photo, a signature, complete
  const events = [mk("job.started"), mk("job.media"), mk("job.media"), mk("job.completed")];
  const uuids = events.map((e) => e.client_uuid);
  const onServer = async () => (await pool.query(`select count(*)::int n from outbox_events where client_uuid = any($1)`, [uuids])).rows[0].n;

  // Phase 1 — connection drops after the first 2 land.
  const r1 = await ingestDeviceEvents(pool, tenantId, events.slice(0, 2));
  assert.equal(r1.accepted.length, 2);
  assert.equal(await onServer(), 2, "2 landed before the drop");

  // Phase 2 — reconnect. The device re-posts ALL 4: it doesn't know which of the
  // first 2 the server committed (lost ack), so it re-sends them too.
  const r2 = await ingestDeviceEvents(pool, tenantId, events);
  assert.equal(r2.accepted.length, 4, "all 4 accepted (2 pre-existing + 2 new)");
  assert.equal(await onServer(), 4, "still exactly 4 — the re-posts did NOT duplicate");

  // no client_uuid appears more than once
  const dupes = (await pool.query(
    `select client_uuid from outbox_events where client_uuid = any($1) group by client_uuid having count(*) > 1`, [uuids])).rowCount;
  assert.equal(dupes, 0, "every event landed exactly once");

  // the job completed exactly once on the server
  const job = (await pool.query(`select status from jobs where id=$1`, [jobId])).rows[0];
  assert.equal(job.status, "completed", "job marked completed server-side");
});
