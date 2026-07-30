// Tier 1 · Item 2 — job cost engine via the job.completed consumer.
// Proves the hard gate (no job_costs while costing config is ASSUMED) and that,
// once configured, completing a job produces a costed row. Scoped to a throwaway
// tenant. Deterministic SQL engine (fn_cost_job) behind the consumer.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { emitEvent, drainOnce, consumers } from "../src/index.js";

let tenantId: string, slId: string, custId: string, techId: string;

async function completedJob(): Promise<string> {
  const jobId = (await pool.query(
    `insert into jobs (tenant_id, service_line_id, customer_id, status, device_started_at, device_completed_at, completed_at, generation_snapshot)
     values ($1,$2,$3,'completed', now()-interval '2 hours', now(), now(), '{}'::jsonb) returning id`,
    [tenantId, slId, custId],
  )).rows[0].id;
  await pool.query(`insert into job_assignments (tenant_id, job_id, technician_id) values ($1,$2,$3)`, [tenantId, jobId, techId]);
  await pool.query(
    `insert into job_labour_entries (tenant_id, service_line_id, job_id, technician_id, minutes) values ($1,$2,$3,$4,120)`,
    [tenantId, slId, jobId, techId],
  );
  return jobId;
}
async function complete(jobId: string): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await emitEvent(c, { tenant_id: tenantId, event_type: "job.completed", aggregate_type: "job", entity_id: jobId, payload: { job_id: jobId, client_uuid: randomUUID() } });
    await c.query("commit");
  } finally { c.release(); }
}
const costCount = async (jobId: string) => (await pool.query(`select count(*)::int n from job_costs where job_id=$1`, [jobId])).rows[0].n;

before(async () => {
  const t = await pool.query(`select id from tenants where name='T2 Costing Test' limit 1`);
  tenantId = t.rows[0]?.id ?? (await pool.query(`insert into tenants(name) values ('T2 Costing Test') returning id`)).rows[0].id;
  slId = (await pool.query(`insert into service_lines(tenant_id,code,name) values ($1,'t2cost','T2') on conflict (tenant_id,code) do update set name=excluded.name returning id`, [tenantId])).rows[0].id;
  custId = (await pool.query(`insert into customers(tenant_id,service_line_id,trade_name) values ($1,$2,'Cost Cust') returning id`, [tenantId, slId])).rows[0].id;
  techId = (await pool.query(`insert into technicians(tenant_id,service_line_id,code,full_name) values ($1,$2,$3,'Tech') returning id`, [tenantId, slId, "t2-" + randomUUID().slice(0, 8)])).rows[0].id;
  // start UNCONFIGURED: remove any cost settings for this tenant
  await pool.query(`delete from settings where tenant_id=$1 and key like 'cost.%'`, [tenantId]);
});

after(async () => {
  await pool.query(`delete from settings where tenant_id=$1 and key like 'cost.%'`, [tenantId]);
  await pool.end();
});

test("gate: job.completed produces NO job_costs while costing config is unset/ASSUMED", async () => {
  const jobId = await completedJob();
  await complete(jobId);
  await drainOnce(pool, consumers, { tenantId });
  assert.equal(await costCount(jobId), 0, "no cost row while unconfigured — no half-real margins");
});

test("configured: job.completed costs the job (labour at standard, distance estimated)", async () => {
  // confirm standard rates (non-assumed). No GL accounts seeded for this tenant,
  // so the account-code gate passes trivially (nothing ASSUMED to block on).
  await pool.query(
    `insert into settings(tenant_id,service_line_id,key,value,is_assumed) values
       ($1,$2,'cost.standard_labour_rate_hourly','30'::jsonb,false),
       ($1,$2,'cost.standard_vehicle_rate_per_km','0.6'::jsonb,false)`,
    [tenantId, slId],
  );
  const jobId = await completedJob();
  await complete(jobId);
  await drainOnce(pool, consumers, { tenantId });

  assert.equal(await costCount(jobId), 1, "one cost row once configured");
  const jc = (await pool.query(
    `select labour_cost::float8 labour, vehicle_cost::float8 vehicle, total_cost::float8 total, cost_confidence, distance_estimated, labour_estimated
       from job_cost_current where job_id=$1`, [jobId],
  )).rows[0];
  assert.equal(jc.labour, 60, "2h x AED 30 standard");
  assert.equal(jc.vehicle, 24, "no distance -> 2h x 20km x 0.6 estimated");
  assert.equal(jc.total, 84, "60 + 24 (no material/revenue)");
  assert.equal(jc.labour_estimated, false, "labour from the clocked entry");
  assert.equal(jc.distance_estimated, true, "distance derived from time");
  assert.equal(jc.cost_confidence, "estimated", "estimated because distance was inferred");

  // replay: draining again does not double-cost (per-event claim)
  await drainOnce(pool, consumers, { tenantId });
  assert.equal(await costCount(jobId), 1, "replay: still one cost row");
});
