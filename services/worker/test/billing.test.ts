// K4-3 — on job.completed: queue an invoice (pricing-model correct) + deduct stock.
// per_treatment invoices per visit; fixed_period does NOT (billed periodically).
// Idempotent. Scoped to a throwaway tenant.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { emitEvent, drainOnce, consumers } from "../src/index.js";

let tenantId: string, slId: string, custId: string, itemId: string;

async function makeJob(snapshot: object): Promise<string> {
  return (await pool.query(
    `insert into jobs (tenant_id, service_line_id, customer_id, status, generation_snapshot)
     values ($1,$2,$3,'completed',$4) returning id`,
    [tenantId, slId, custId, JSON.stringify(snapshot)],
  )).rows[0].id;
}
async function emitCompleted(jobId: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await emitEvent(client, {
      tenant_id: tenantId, event_type: "job.completed", aggregate_type: "job", entity_id: jobId,
      payload: { job_id: jobId, client_uuid: randomUUID() },
    });
    await client.query("commit");
  } finally { client.release(); }
}
const invCount = async (jobId: string) => (await pool.query(`select count(*)::int n from invoices where job_id=$1`, [jobId])).rows[0].n;
const stockCount = async (jobId: string) => (await pool.query(`select count(*)::int n from stock_movements where job_id=$1`, [jobId])).rows[0].n;

before(async () => {
  const t = await pool.query(`select id from tenants where name='K4 Billing Test' limit 1`);
  tenantId = t.rows[0]?.id ?? (await pool.query(`insert into tenants(name) values ('K4 Billing Test') returning id`)).rows[0].id;
  slId = (await pool.query(`insert into service_lines(tenant_id,code,name) values ($1,'k4bill','K4 Bill') on conflict (tenant_id,code) do update set name=excluded.name returning id`, [tenantId])).rows[0].id;
  custId = (await pool.query(`insert into customers(tenant_id,service_line_id,trade_name,legal_name,trn,emirate,customer_type) values ($1,$2,'ACME Cafe','ACME Trading LLC','100200300400500','Sharjah','B2B') returning id`, [tenantId, slId])).rows[0].id;
  itemId = (await pool.query(`insert into items(tenant_id,service_line_id,name,item_type) values ($1,$2,'Test Chemical','chemical') returning id`, [tenantId, slId])).rows[0].id;
});

after(async () => {
  // Only invoices/lines are deletable. jobs/items/customers are referenced by
  // append-only stock_movements, so they stay under the isolated test tenant.
  await pool.query(`delete from invoice_lines where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from invoices where tenant_id=$1`, [tenantId]);
  await pool.end();
});

test("per_treatment job.completed queues one invoice with frozen identity + VAT; stock deducted; idempotent", async () => {
  const jobId = await makeJob({
    pricing: { billing: "per_visit", per_visit_price: 1200, currency: "AED", pricing_model: "per_treatment" },
    dose: { item_id: itemId, quantity: 500, unit_id: null },
  });
  await emitCompleted(jobId);
  await drainOnce(pool, consumers, { tenantId });

  assert.equal(await invCount(jobId), 1, "one invoice queued");
  const inv = (await pool.query(`select status, total::float8 total, buyer_legal_name, buyer_trn from invoices where job_id=$1`, [jobId])).rows[0];
  assert.equal(inv.status, "queued");
  assert.equal(inv.total, 1260, "1200 + 5% VAT");
  assert.equal(inv.buyer_legal_name, "ACME Trading LLC", "buyer identity frozen at issue");
  assert.equal(inv.buyer_trn, "100200300400500");
  assert.equal(await stockCount(jobId), 1, "stock deducted from the frozen dose");

  // replay: draining again changes nothing
  await drainOnce(pool, consumers, { tenantId });
  assert.equal(await invCount(jobId), 1, "replay: still one invoice");
  assert.equal(await stockCount(jobId), 1, "replay: still one stock movement");
});

test("fixed_period job.completed does NOT queue a per-visit invoice", async () => {
  const jobId = await makeJob({ pricing: { billing: "fixed_period", period_total: 2400, currency: "AED", pricing_model: "fixed_period" } });
  await emitCompleted(jobId);
  await drainOnce(pool, consumers, { tenantId });
  assert.equal(await invCount(jobId), 0, "fixed-annual is billed periodically, not per visit");
  assert.equal(await stockCount(jobId), 0, "no dose -> no stock movement");
});
