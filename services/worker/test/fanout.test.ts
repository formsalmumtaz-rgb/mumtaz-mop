// K2 — contract fan-out. Deterministic schedule counts (pure), then a full
// activation -> schedule + jobs + reminder, with frozen snapshots and idempotent
// replay. Scoped to a throwaway tenant so it never touches demo data.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { emitEvent, drainOnce, consumers } from "../src/index.js";
import { generateVisitDates } from "../src/schedule.js";

test("visit dates: counts from frequency spec; spacing is config-driven", () => {
  const freq = (pc: number, v: number) => ({ period_unit: "month" as const, period_count: pc, visits_per_period: v });
  const count = (pc: number, v: number) => generateVisitDates("2026-07-25", freq(pc, v), 12).length;
  // count comes from visits_per_period × periods — NOT hardcoded, not doubled
  assert.equal(count(1, 2), 24, "monthly × 2 → 24/yr");
  assert.equal(count(1, 1), 12, "monthly × 1 → 12/yr (a monthly contract is NOT 24)");
  assert.equal(count(2, 1), 6, "bi-monthly → 6/yr");

  // the visit_spacing setting genuinely changes placement (not hardcoded)
  const even = generateVisitDates("2026-07-25", freq(1, 2), 12, "even");
  const fromStart = generateVisitDates("2026-07-25", freq(1, 2), 12, "from_start");
  assert.equal(even.length, fromStart.length, "spacing does not change the count");
  assert.notEqual(even[0], fromStart[0], "spacing strategy changes the dates — driven by the setting");
});

let tenantId: string, slId: string, customerId: string, freqId: string, contractId: string;

before(async () => {
  const t = await pool.query(`select id from tenants where name='K2 Test Tenant' limit 1`);
  tenantId = t.rows[0]?.id ?? (await pool.query(`insert into tenants(name) values ('K2 Test Tenant') returning id`)).rows[0].id;
  slId = (await pool.query(
    `insert into service_lines(tenant_id, code, name) values ($1,'k2test','K2 Test')
     on conflict (tenant_id, code) do update set name=excluded.name returning id`, [tenantId])).rows[0].id;
  customerId = (await pool.query(
    `insert into customers(tenant_id, service_line_id, trade_name) values ($1,$2,'K2 Cust') returning id`, [tenantId, slId])).rows[0].id;
  await pool.query(
    `insert into customer_branches(tenant_id, service_line_id, customer_id, name, location)
     values ($1,$2,$3,'K2 Branch', ST_SetSRID(ST_MakePoint(55.4,25.3),4326)::geography)`, [tenantId, slId, customerId]);
  freqId = (await pool.query(
    `insert into frequencies(tenant_id, service_line_id, code, name, period_unit, period_count, visits_per_period)
     values ($1,$2,'k2_m2','Monthly x2','month',1,2)
     on conflict (tenant_id, service_line_id, code) do update set name=excluded.name returning id`, [tenantId, slId])).rows[0].id;
});

after(async () => {
  await pool.query(`delete from jobs where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from contract_schedule where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from reminders where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from contracts where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from customer_branches where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from customers where tenant_id=$1`, [tenantId]);
  await pool.end();
});

test("contract.activated fans out to schedule + jobs + reminder; replay is idempotent", async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    contractId = (await client.query(
      `insert into contracts
         (tenant_id, service_line_id, customer_id, contract_number, frequency_id, contract_value, currency,
          start_date, end_date, lifecycle_status)
       values ($1,$2,$3,'K2-1',$4,2400,'AED', current_date, current_date + interval '12 months', 'active')
       returning id`,
      [tenantId, slId, customerId, freqId],
    )).rows[0].id;
    await emitEvent(client, {
      tenant_id: tenantId, event_type: "contract.activated", aggregate_type: "contract", entity_id: contractId,
      payload: { contract_id: contractId, customer_id: customerId, service_line_id: slId },
    });
    await client.query("commit");
  } finally {
    client.release();
  }

  await drainOnce(pool, consumers, { tenantId });

  const n = async (sql: string) => (await pool.query(sql, [contractId])).rows[0].n as number;
  const sched = await n(`select count(*)::int n from contract_schedule where contract_id=$1`);
  const jobs = await n(`select count(*)::int n from jobs where contract_id=$1`);
  const rem = await n(`select count(*)::int n from reminders where entity_id=$1`);

  assert.equal(sched, 24, "monthly × 2 over 12 months → 24 schedule rows");
  assert.ok(jobs >= 1 && jobs <= 4, `next-30-day jobs generated (got ${jobs})`);
  assert.equal(rem, 1, "one renewal reminder");

  // frozen snapshot on the schedule row
  const snap = (await pool.query(
    `select snapshot->'pricing'->>'billing' as billing from contract_schedule where contract_id=$1 limit 1`, [contractId])).rows[0];
  assert.equal(snap.billing, "fixed_period", "fixed-annual pricing frozen on the schedule row");

  // replay changes nothing
  await drainOnce(pool, consumers, { tenantId });
  assert.equal(await n(`select count(*)::int n from contract_schedule where contract_id=$1`), 24, "replay: still 24 schedule rows");
  assert.equal(await n(`select count(*)::int n from jobs where contract_id=$1`), jobs, "replay: no duplicate jobs");
});
