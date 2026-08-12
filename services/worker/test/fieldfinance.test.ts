// T5 — cash + expense from the field. cash.collected -> a cash receipt;
// expense.recorded -> a submitted expense claim. Both idempotent on replay.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { ingestDeviceEvents, drainOnce, consumers } from "../src/index.js";

const ACTOR = "00000000-0000-0000-0000-0000000000aa";
let tenantId: string, slId: string, custId: string, jobId: string;

before(async () => {
  const t = await pool.query(`select id from tenants where name='T5 Fin Tenant' limit 1`);
  tenantId = t.rows[0]?.id ?? (await pool.query(`insert into tenants(name) values ('T5 Fin Tenant') returning id`)).rows[0].id;
  slId = (await pool.query(
    `insert into service_lines(tenant_id, code, name) values ($1,'t5fin','T5 Fin')
     on conflict (tenant_id, code) do update set name=excluded.name returning id`, [tenantId])).rows[0].id;
  custId = (await pool.query(`insert into customers(tenant_id, service_line_id, trade_name) values ($1,$2,'T5 Cust') returning id`, [tenantId, slId])).rows[0].id;
  jobId = (await pool.query(`insert into jobs(tenant_id, service_line_id, customer_id, status) values ($1,$2,$3,'in_progress') returning id`, [tenantId, slId, custId])).rows[0].id;
  // Real tenants have the RCP counter seeded; this throwaway tenant needs it.
  await pool.query(`insert into document_counters(tenant_id, series_key, prefix, next_value) values ($1,'RCP','RCP',1) on conflict (tenant_id, series_key) do nothing`, [tenantId]);
});

after(async () => { await pool.end(); });

test("cash.collected posts one cash receipt against the job's customer", async () => {
  await ingestDeviceEvents(pool, tenantId,
    [{ client_uuid: randomUUID(), event_type: "cash.collected", job_id: jobId, device_time: new Date().toISOString(),
       payload: { job_id: jobId, amount: 250, note: "one-off treatment" } }], { actorId: ACTOR });
  await drainOnce(pool, consumers, { tenantId });
  // Scope to THIS run's customer (the throwaway tenant persists across runs).
  const r = (await pool.query(`select method, amount::float8 amount, customer_id from receipts where tenant_id=$1 and customer_id=$2`, [tenantId, custId])).rows;
  assert.equal(r.length, 1);
  assert.equal(r[0].method, "cash");
  assert.equal(r[0].amount, 250);
  // replay -> still one
  await drainOnce(pool, consumers, { tenantId });
  assert.equal((await pool.query(`select count(*)::int n from receipts where tenant_id=$1 and customer_id=$2`, [tenantId, custId])).rows[0].n, 1);
});

test("expense.recorded books one submitted expense; client_uuid dedups", async () => {
  const cu = randomUUID();
  const ev = { client_uuid: randomUUID(), event_type: "expense.recorded", job_id: jobId, device_time: new Date().toISOString(),
    payload: { job_id: jobId, client_uuid: cu, amount: 100, description: "fuel" } };
  await ingestDeviceEvents(pool, tenantId, [ev], { actorId: ACTOR });
  await drainOnce(pool, consumers, { tenantId });
  const e = (await pool.query(`select status, amount::float8 amount, description from expenses where tenant_id=$1 and client_uuid=$2`, [tenantId, cu])).rows;
  assert.equal(e.length, 1);
  assert.equal(e[0].status, "submitted");
  assert.equal(e[0].amount, 100);
  // a DIFFERENT outbox event carrying the SAME expense client_uuid must not double-book.
  await ingestDeviceEvents(pool, tenantId,
    [{ client_uuid: randomUUID(), event_type: "expense.recorded", job_id: jobId, device_time: new Date().toISOString(),
       payload: { job_id: jobId, client_uuid: cu, amount: 100, description: "fuel (resend)" } }], { actorId: ACTOR });
  await drainOnce(pool, consumers, { tenantId });
  assert.equal((await pool.query(`select count(*)::int n from expenses where tenant_id=$1 and client_uuid=$2`, [tenantId, cu])).rows[0].n, 1, "client_uuid dedup");
});
