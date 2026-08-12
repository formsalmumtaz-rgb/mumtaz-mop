// T4 — the post-inspection consumer: a job.inspected event writes one append-only
// job_inspections row per area, exactly once (replay is a no-op).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { ingestDeviceEvents, drainOnce, consumers } from "../src/index.js";

const ACTOR = "00000000-0000-0000-0000-0000000000aa";
let tenantId: string, slId: string, jobId: string;

before(async () => {
  const t = await pool.query(`select id from tenants where name='T4 Insp Tenant' limit 1`);
  tenantId = t.rows[0]?.id ?? (await pool.query(`insert into tenants(name) values ('T4 Insp Tenant') returning id`)).rows[0].id;
  slId = (await pool.query(
    `insert into service_lines(tenant_id, code, name) values ($1,'t4insp','T4 Insp')
     on conflict (tenant_id, code) do update set name=excluded.name returning id`, [tenantId])).rows[0].id;
  const cust = (await pool.query(
    `insert into customers(tenant_id, service_line_id, trade_name) values ($1,$2,'T4 Cust') returning id`, [tenantId, slId])).rows[0].id;
  jobId = (await pool.query(
    `insert into jobs(tenant_id, service_line_id, customer_id, status) values ($1,$2,$3,'in_progress') returning id`, [tenantId, slId, cust])).rows[0].id;
});

after(async () => {
  // job_inspections is append-only and FK-references the job, so leave the
  // throwaway tenant's rows in place (as with the other append-only tests).
  await pool.end();
});

test("job.inspected writes append-only inspections; replay is a no-op", async () => {
  const dt = new Date().toISOString();
  const ev = {
    client_uuid: randomUUID(), event_type: "job.inspected", job_id: jobId, device_time: dt,
    payload: {
      job_id: jobId, device_time: dt,
      entries: [
        { area: "kitchen", issue_type: "cockroach", hygiene_score: 3, structural_score: 4, infestation_level: "low", notes: "under sink" },
        { area: "wash", issue_type: "rodent", hygiene_score: 2, structural_score: 3, infestation_level: "medium" },
      ],
    },
  };
  await ingestDeviceEvents(pool, tenantId, [ev], { actorId: ACTOR });
  await drainOnce(pool, consumers, { tenantId });

  const rows = (await pool.query(
    `select area, issue_type, hygiene_score, structural_score, infestation_level from job_inspections where job_id=$1 order by area`, [jobId])).rows;
  assert.equal(rows.length, 2, "one row per area");
  assert.equal(rows[0].area, "kitchen");
  assert.equal(rows[0].hygiene_score, 3);
  assert.equal(rows[1].infestation_level, "medium");

  // Replay: re-drain -> exactly-once, no duplicates.
  await drainOnce(pool, consumers, { tenantId });
  const n = (await pool.query(`select count(*)::int n from job_inspections where job_id=$1`, [jobId])).rows[0].n;
  assert.equal(n, 2, "replay did not duplicate");

  // Append-only: UPDATE/DELETE are rejected.
  let blocked = false;
  try { await pool.query(`update job_inspections set notes='x' where job_id=$1`, [jobId]); }
  catch { blocked = true; }
  assert.equal(blocked, true, "job_inspections is append-only");
});
