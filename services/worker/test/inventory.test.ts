// Tier 1 · Item 1 — chemical batch traceability & unit costing.
// Proves the perpetual-inventory loop end to end against the real DB:
//   * recordPurchase posts a balanced receipt (Dr Inventory / Cr Payable)
//   * job.completed consumes from the technician's VAN under FEFO
//   * consumption posts exactly ONE balanced entry per event (Dr Expense /
//     Cr Inventory), valued at the batch's frozen unit cost — never one per unit
//   * replay is a no-op (idempotent)
// Scoped to a throwaway tenant; a fresh item+van per run isolates FEFO scope.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { emitEvent, drainOnce, consumers, recordPurchase } from "../src/index.js";

let tenantId: string, slId: string, custId: string, mlId: string, lId: string;

async function freshItem(): Promise<string> {
  return (await pool.query(
    `insert into items(tenant_id, service_line_id, name, item_type, base_unit_id)
     values ($1,$2,$3,'chemical',$4) returning id`,
    [tenantId, slId, "Chem " + randomUUID().slice(0, 8), mlId],
  )).rows[0].id;
}
async function freshTechAndVan(): Promise<{ techId: string; vanId: string }> {
  const techId = (await pool.query(
    `insert into technicians(tenant_id, service_line_id, code, full_name) values ($1,$2,$3,'Test Tech') returning id`,
    [tenantId, slId, "tech-" + randomUUID().slice(0, 8)],
  )).rows[0].id;
  const vanId = (await pool.query(
    `insert into stock_locations(tenant_id, service_line_id, name, location_type, technician_id, vehicle_ref)
     values ($1,$2,$3,'van',$4,$5) returning id`,
    [tenantId, slId, "Van " + randomUUID().slice(0, 6), techId, "DXB-" + randomUUID().slice(0, 5)],
  )).rows[0].id;
  return { techId, vanId };
}
async function makeJob(itemId: string, techId: string): Promise<string> {
  const jobId = (await pool.query(
    `insert into jobs(tenant_id, service_line_id, customer_id, status, generation_snapshot)
     values ($1,$2,$3,'completed',$4) returning id`,
    [tenantId, slId, custId, JSON.stringify({ dose: { item_id: itemId, quantity: 50, unit_id: mlId } })],
  )).rows[0].id;
  await pool.query(`insert into job_assignments(tenant_id, job_id, technician_id) values ($1,$2,$3)`, [tenantId, jobId, techId]);
  return jobId;
}
async function emitCompleted(jobId: string): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await emitEvent(c, {
      tenant_id: tenantId, event_type: "job.completed", aggregate_type: "job", entity_id: jobId,
      payload: { job_id: jobId, client_uuid: randomUUID() },
    });
    await c.query("commit");
  } finally { c.release(); }
}
async function receive(itemId: string, vanId: string, packSize: number, totalCost: number, expiryDays: number) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await recordPurchase(c, {
      tenantId, serviceLineId: slId, itemId, packQuantity: 1, packSize, packUnitId: lId, baseUnitId: mlId,
      totalCost, currency: "AED", toLocationId: vanId, paymentMode: "payable",
      expiryDate: new Date(Date.now() + expiryDays * 864e5).toISOString().slice(0, 10),
      batchNo: "B-" + randomUUID().slice(0, 6),
    });
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback"); throw e; }
  finally { c.release(); }
}

before(async () => {
  const t = await pool.query(`select id from tenants where name='T1 Inventory Test' limit 1`);
  tenantId = t.rows[0]?.id ?? (await pool.query(`insert into tenants(name) values ('T1 Inventory Test') returning id`)).rows[0].id;
  slId = (await pool.query(
    `insert into service_lines(tenant_id,code,name) values ($1,'t1inv','T1 Inv')
     on conflict (tenant_id,code) do update set name=excluded.name returning id`, [tenantId],
  )).rows[0].id;
  custId = (await pool.query(
    `insert into customers(tenant_id,service_line_id,trade_name) values ($1,$2,'Trace Cust') returning id`, [tenantId, slId],
  )).rows[0].id;
  // units with conversion (ml base; 1 L = 1000 ml)
  mlId = (await pool.query(
    `insert into units(tenant_id,service_line_id,code,name,dimension) values ($1,$2,'ml','Millilitre','volume')
     on conflict (tenant_id,service_line_id,code) do update set name=excluded.name returning id`, [tenantId, slId],
  )).rows[0].id;
  lId = (await pool.query(
    `insert into units(tenant_id,service_line_id,code,name,dimension,base_unit_id,to_base_factor)
     values ($1,$2,'l','Litre','volume',$3,1000)
     on conflict (tenant_id,service_line_id,code) do update set to_base_factor=1000, base_unit_id=$3 returning id`, [tenantId, slId, mlId],
  )).rows[0].id;
  await pool.query(`update units set base_unit_id=$1 where id=$1`, [mlId]);
  // ASSUMED chart of accounts for this tenant
  await pool.query(
    `insert into accounts(tenant_id,code,name,account_type,is_assumed) values
       ($1,'1300','Inventory — Chemicals','asset',true),
       ($1,'5100','Cost of Chemicals Consumed','expense',true),
       ($1,'2100','Accounts Payable','liability',true),
       ($1,'5190','Inventory Rounding','expense',true)
     on conflict (tenant_id,code) do nothing`, [tenantId],
  );
  // inventory settings (fresh each run)
  await pool.query(`delete from settings where tenant_id=$1 and key like 'inventory.%'`, [tenantId]);
  await pool.query(
    `insert into settings(tenant_id,service_line_id,key,value,is_assumed) values
       ($1,$2,'inventory.batch_allocation_strategy','"fefo_then_fifo"'::jsonb,true),
       ($1,null,'inventory.account_code.asset','"1300"'::jsonb,true),
       ($1,null,'inventory.account_code.expense','"5100"'::jsonb,true),
       ($1,null,'inventory.account_code.payable','"2100"'::jsonb,true),
       ($1,null,'inventory.account_code.rounding','"5190"'::jsonb,true)`, [tenantId, slId],
  );
});

after(async () => {
  // append-only ledger/movement/purchase rows stay under the isolated tenant.
  await pool.query(`delete from settings where tenant_id=$1 and key like 'inventory.%'`, [tenantId]);
  await pool.end();
});

test("recordPurchase posts a balanced receipt entry and freezes batch unit cost", async () => {
  const itemId = await freshItem();
  const { vanId } = await freshTechAndVan();
  const r = await receive(itemId, vanId, 10, 100, 180); // 10 L @ AED 100 -> 0.01/ml

  const b = (await pool.query(`select unit_cost::float8 uc from item_batches where id=$1`, [r.batchId])).rows[0];
  assert.equal(b.uc, 0.01, "unit cost frozen at AED 0.01 per ml (100 / 10000 ml)");

  const je = (await pool.query(
    `select sum(jl.debit)::float8 dr, sum(jl.credit)::float8 cr, count(*)::int lines
       from journal_lines jl where jl.journal_entry_id = $1`, [r.journalEntryId],
  )).rows[0];
  assert.equal(je.lines, 2, "receipt is one entry of two lines");
  assert.equal(je.dr, 100, "Dr Inventory 100");
  assert.equal(je.cr, 100, "Cr Payable 100 (balanced)");
});

test("job.completed consumes from the van under FEFO and posts ONE valued entry; replay is a no-op", async () => {
  const itemId = await freshItem();
  const { techId, vanId } = await freshTechAndVan();
  await receive(itemId, vanId, 10, 100, 180);                    // B1: 0.01/ml, expiry +180
  const b2 = (await receive(itemId, vanId, 10, 200, 30)).batchId; // B2: 0.02/ml, expiry +30 (nearer -> FEFO)

  const jobId = await makeJob(itemId, techId);
  await emitCompleted(jobId);
  await drainOnce(pool, consumers, { tenantId });

  const mv = (await pool.query(
    `select id, batch_id from stock_movements where job_id=$1 and movement_type='consumption'`, [jobId],
  )).rows;
  assert.equal(mv.length, 1, "exactly one consumption movement");
  assert.equal(mv[0].batch_id, b2, "FEFO selected the nearer-expiry batch (B2)");

  const val = (await pool.query(
    `select sum(jl.debit)::float8 dr, sum(jl.credit)::float8 cr, count(*)::int lines,
            count(distinct je.id)::int entries
       from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id
      where je.tenant_id=$1 and je.source_type='stock_valuation' and je.source_id=$2`, [tenantId, mv[0].id],
  )).rows[0];
  assert.equal(val.entries, 1, "ONE valuation entry per consumption event (not per unit)");
  assert.equal(val.lines, 2, "two lines: Dr expense, Cr inventory");
  assert.equal(val.dr, 1.0, "Dr Cost of Chemicals = 50 ml * 0.02 = AED 1.00");
  assert.equal(val.cr, 1.0, "Cr Inventory = 1.00 (balanced)");

  // trace answers "where was batch used" with the valued cost
  const trace = (await pool.query(
    `select customer, technician, vehicle_ref, valued_cost::float8 vc from batch_usage_trace where batch_id=$1`, [b2],
  )).rows[0];
  assert.equal(trace.vc, 1.0, "trace valued_cost matches");
  assert.ok(trace.technician && trace.vehicle_ref, "trace carries technician + vehicle");

  // replay: draining again changes nothing
  await drainOnce(pool, consumers, { tenantId });
  const again = (await pool.query(
    `select count(*)::int n from journal_entries where tenant_id=$1 and source_type='stock_valuation' and source_id=$2`, [tenantId, mv[0].id],
  )).rows[0].n;
  assert.equal(again, 1, "replay: still exactly one valuation entry");
});
