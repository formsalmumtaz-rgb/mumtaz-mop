// Recurring contract billing — deterministic, idempotent, date-driven.
// Monthly contract generates exactly one invoice for a due period; rerunning the
// worker creates no duplicates; the schedule advances. Scoped to a throwaway
// tenant (fully seeded like a provisioned tenant).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { runContractBilling } from "../src/index.js";

let tenantId: string, slId: string, custId: string, contractId: string;

before(async () => {
  tenantId = (await pool.query(`insert into tenants(name) values ('Recurring Billing Test') returning id`)).rows[0].id;
  slId = (await pool.query(`insert into service_lines(tenant_id,code,name) values ($1,'rbill','R Bill') returning id`, [tenantId])).rows[0].id;
  custId = (await pool.query(`insert into customers(tenant_id,service_line_id,trade_name,legal_name) values ($1,$2,'Cafe','Cafe LLC') returning id`, [tenantId, slId])).rows[0].id;
  // financial seeding (numbering + GL accounts + settings) a provisioned tenant would have
  await pool.query(`insert into document_counters(tenant_id,series_key,prefix,next_value) values ($1,'AMTX','AMTX',1),($1,'AMTX_OW','AMTX/OW',1)`, [tenantId]);
  await pool.query(`insert into accounts(tenant_id,code,name,account_type) values ($1,'1000','Bank','asset'),($1,'1100','AR','asset'),($1,'2200','VAT','liability'),($1,'4000','Revenue','income')`, [tenantId]);
  await pool.query(
    `insert into settings(tenant_id,service_line_id,key,value) values
       ($1,null,'gl.account_code.bank',to_jsonb('1000'::text)),
       ($1,null,'gl.account_code.receivable',to_jsonb('1100'::text)),
       ($1,null,'gl.account_code.vat_output',to_jsonb('2200'::text)),
       ($1,null,'gl.account_code.revenue',to_jsonb('4000'::text)),
       ($1,null,'ar.default_vat_rate',to_jsonb(5)),
       ($1,null,'ar.default_payment_terms_days',to_jsonb(30))`, [tenantId]);
  contractId = (await pool.query(
    `insert into contracts(tenant_id,service_line_id,customer_id,lifecycle_status,contract_value,currency,vat_treatment,start_date,billing_frequency,billing_day,auto_generate_invoice,next_invoice_date)
     values ($1,$2,$3,'active',500,'AED','standard','2026-01-15','monthly',15,true,'2026-06-15') returning id`,
    [tenantId, slId, custId])).rows[0].id;
});

const invCount = async () => (await pool.query(`select count(*)::int n from invoices where contract_id=$1`, [contractId])).rows[0].n;
const nextDate = async () => (await pool.query(`select next_invoice_date::text d from contracts where id=$1`, [contractId])).rows[0].d;

test("monthly contract bills exactly one invoice for a due period", async () => {
  const n = await runContractBilling(pool, tenantId, "2026-06-15");
  assert.equal(n, 1, "one invoice generated");
  assert.equal(await invCount(), 1);
  assert.equal(await nextDate(), "2026-07-15", "advanced one month");
});

test("rerunning the worker creates no duplicates (idempotent)", async () => {
  const n = await runContractBilling(pool, tenantId, "2026-06-15");
  assert.equal(n, 0, "nothing due on rerun");
  assert.equal(await invCount(), 1, "still exactly one invoice");
});

test("generated invoice is issued, numbered and GL-posted", async () => {
  const inv = (await pool.query(`select id, status, invoice_number, billing_period::text from invoices where contract_id=$1`, [contractId])).rows[0];
  assert.equal(inv.status, "issued");
  assert.match(inv.invoice_number, /^AMTX\//);
  assert.equal(inv.billing_period, "2026-06-15");
  const gl = (await pool.query(`select count(*)::int n from journal_entries where source_type='invoice' and source_id=$1`, [inv.id])).rows[0].n;
  assert.equal(gl, 1, "posted to the GL exactly once");
});

after(async () => {
  // Delete what's deletable; append-only journal rows stay under the isolated tenant.
  await pool.query(`delete from invoice_lines where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from invoices where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from billing_failures where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from contract_services where tenant_id=$1`, [tenantId]);
  await pool.query(`delete from contracts where tenant_id=$1`, [tenantId]);
});
