// T1 — event provenance + revocation. Proves Art. VII §4 (device + server time on
// every offline record), the time-drift sanity flag, and that events from a
// revoked login are HELD (skipped by the drain) not discarded, then releasable.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { ingestDeviceEvents } from "../src/index.js";
import { assessDeviceTime } from "../src/ingest.js";

const ACTOR = "00000000-0000-0000-0000-0000000000aa";
let tenantId: string, slId: string, jobId: string;

before(async () => {
  const t = await pool.query(`select id from tenants where name='T1 Prov Tenant' limit 1`);
  tenantId = t.rows[0]?.id ?? (await pool.query(`insert into tenants(name) values ('T1 Prov Tenant') returning id`)).rows[0].id;
  slId = (await pool.query(
    `insert into service_lines(tenant_id, code, name) values ($1,'t1prov','T1 Prov')
     on conflict (tenant_id, code) do update set name=excluded.name returning id`, [tenantId])).rows[0].id;
  const cust = (await pool.query(
    `insert into customers(tenant_id, service_line_id, trade_name) values ($1,$2,'T1 Cust') returning id`, [tenantId, slId])).rows[0].id;
  jobId = (await pool.query(
    `insert into jobs(tenant_id, service_line_id, customer_id, status) values ($1,$2,$3,'scheduled') returning id`, [tenantId, slId, cust])).rows[0].id;
});

after(async () => {
  // outbox_events is append-only (no DELETE) — leave the throwaway tenant's rows.
  await pool.query(`delete from jobs where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from customers where tenant_id=$1`, [tenantId]);
  await pool.end();
});

test("assessDeviceTime flags implausible clocks, accepts plausible ones", () => {
  const now = new Date();
  assert.equal(assessDeviceTime(new Date(now.getTime() + 10 * 60000).toISOString(), now).suspect, true, "future");
  assert.equal(assessDeviceTime(new Date(now.getTime() - 10 * 24 * 3600000).toISOString(), now).suspect, true, "far behind");
  assert.equal(assessDeviceTime(new Date(now.getTime() - 30000).toISOString(), now).suspect, false, "plausible");
  assert.equal(assessDeviceTime("not-a-date", now).suspect, true, "unparseable");
});

test("provenance: both timestamps persist; suspect clock is flagged but NOT held", async () => {
  const cu = randomUUID();
  const future = new Date(Date.now() + 30 * 60000).toISOString();
  const r = await ingestDeviceEvents(pool, tenantId,
    [{ client_uuid: cu, event_type: "job.started", job_id: jobId, payload: {}, device_time: future }], { actorId: ACTOR });
  assert.equal(r.flagged, 1);
  assert.equal(r.heldForReview, 0);
  const row = (await pool.query(
    `select device_time, server_received_at, time_suspect, needs_review, actor_id from outbox_events where client_uuid=$1`, [cu])).rows[0];
  assert.ok(row.device_time, "device_time stored");
  assert.ok(row.server_received_at, "server_received_at stored");
  assert.equal(row.time_suspect, true);
  assert.equal(row.needs_review, false);
  assert.equal(row.actor_id, ACTOR, "actor stamped");
  // The drain WOULD pick it up (its exact predicate returns it).
  const drainable = (await pool.query(
    `select count(*)::int n from outbox_events where processed_at is null and not needs_review and client_uuid=$1`, [cu])).rows[0].n;
  assert.equal(drainable, 1, "suspect-but-active event is drainable");
});

test("revoked login: events ingested but HELD (drain skips), and the job is untouched", async () => {
  const cu = randomUUID();
  const r = await ingestDeviceEvents(pool, tenantId,
    [{ client_uuid: cu, event_type: "job.completed", job_id: jobId, payload: {}, device_time: new Date().toISOString() }],
    { actorId: ACTOR, actorRevoked: true });
  assert.equal(r.accepted.length, 1, "not discarded — accepted");
  assert.equal(r.heldForReview, 1);
  const row = (await pool.query(
    `select needs_review, review_reason from outbox_events where client_uuid=$1`, [cu])).rows[0];
  assert.equal(row.needs_review, true);
  assert.match(row.review_reason, /revoked/);
  // The drain's exact predicate EXCLUDES it (held).
  const held = (await pool.query(
    `select count(*)::int n from outbox_events where processed_at is null and not needs_review and client_uuid=$1`, [cu])).rows[0].n;
  assert.equal(held, 0, "held event is NOT drainable");
  // job.completed side-effect must NOT have fired for a revoked device.
  const status = (await pool.query(`select status from jobs where id=$1`, [jobId])).rows[0].status;
  assert.equal(status, "scheduled", "revoked completion did not complete the job");
  // Admin approval releases it (needs_review cleared -> drainable).
  await pool.query(`update outbox_events set needs_review=false where client_uuid=$1`, [cu]);
  const releasable = (await pool.query(
    `select count(*)::int n from outbox_events where processed_at is null and not needs_review and client_uuid=$1`, [cu])).rows[0].n;
  assert.equal(releasable, 1, "approved event becomes drainable");
});
