import pg from "pg";
const url = new URL(process.env.DATABASE_URL!); url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 3 });
const T = "5b557699-b1d1-417e-b42d-fdd3be366354";
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;

const sl   = (await q(`select id from service_lines where tenant_id=$1 and code='pest_control'`,[T]))[0].id;
const cust = (await q(`select id, code from customers where tenant_id=$1 and code='11193'`,[T]))[0];
const made: { inv: string[]; rcp: string[] } = { inv: [], rcp: [] };

// an AD-HOC invoice, exactly what a technician raises at completion
const mkInvoice = async (amount: number) => {
  const vat = +(amount * 0.05).toFixed(2);
  const id = (await q(`insert into invoices (tenant_id, service_line_id, customer_id, status,
      buyer_legal_name, currency, vat_treatment, subtotal, vat_total, total)
    values ($1,$2,$3,'queued','proof','AED','standard',$4,$5,$6) returning id`,
    [T, sl, cust.id, amount, vat, amount + vat]))[0].id;
  await q(`insert into invoice_lines (tenant_id, invoice_id, line_no, description, quantity, unit_price,
      currency, vat_rate, vat_amount, line_total) values ($1,$2,1,'Service',1,$3,'AED',5,$4,$5)`,
    [T, id, amount, vat, amount + vat]);
  made.inv.push(id); return { id, total: amount + vat };
};
const ar = async (id: string) => (await q(
  `select total::float8 total, allocated::float8 allocated, balance::float8 balance, payment_status
     from invoice_ar where invoice_id=$1`,[id]))[0];
const ledger = async (rcp: string) => (await q(
  `select a.code, jl.debit::float8 d, jl.credit::float8 c
     from journal_lines jl join journal_entries je on je.id=jl.journal_entry_id
     join accounts a on a.id=jl.account_id
    where je.source_type='receipt' and je.source_id=$1 order by a.code`,[rcp]));
const pay = async (invId: string, received: number, applied: number) => {
  const r = (await q(`select fn_record_receipt($1,$2,current_date,'cash',$3,'proof',null,$4::jsonb) id`,
    [T, cust.id, received, JSON.stringify(applied > 0 ? [{ invoice_id: invId, amount: applied }] : [])]))[0].id;
  await q(`select fn_post_receipt_gl($1)`,[r]); made.rcp.push(r); return r;
};
const show = async (label: string, invId: string, rcp: string) => {
  const a = await ar(invId); const L = await ledger(rcp);
  const bal = L.reduce((s:number,x:any)=>s + x.d - x.c, 0);
  console.log(`\n${label}`);
  console.log(`   invoice total ${a.total}  applied ${a.allocated}  BALANCE ${a.balance}  -> ${a.payment_status}`);
  console.log(`   ledger: ${L.map((x:any)=>`${x.code} ${x.d?`Dr ${x.d}`:`Cr ${x.c}`}`).join("  |  ")}`);
  console.log(`   debits - credits = ${bal.toFixed(2)} ${Math.abs(bal)<0.005?"✓ balanced":"✗ UNBALANCED"}`);
};

try {
  console.log("Technician raises an ad-hoc invoice at completion, then records what was actually handed over.\n");

  const i1 = await mkInvoice(500);            // total 525
  await show("A) EXACT — customer pays the full 525", i1.id, await pay(i1.id, 525, 525));

  const i2 = await mkInvoice(500);
  await show("B) UNDERPAYMENT — invoice 525, customer hands over 300", i2.id, await pay(i2.id, 300, 300));

  const i3 = await mkInvoice(500);
  await show("C) OVERPAYMENT — invoice 525, customer hands over 600", i3.id, await pay(i3.id, 600, 525));

  console.log("\nD) allocating more than was received must still be refused");
  try { await pay(i3.id, 100, 200); console.log("   ✗ allowed"); }
  catch (e) { console.log(`   refused: ${(e as Error).message}`); }

  const openAr = await q(`select coalesce(sum(balance),0)::float8 b from invoice_ar where customer_id=$1 and status<>'cancelled'`,[cust.id]);
  console.log(`\ncustomer ${cust.code} open AR across these invoices: AED ${openAr[0].b}`);
} catch (e) { console.error("FAILED:", (e as Error).message); }
finally {
  for (const r of made.rcp) {
    await q(`delete from journal_lines where journal_entry_id in (select id from journal_entries where source_type='receipt' and source_id=$1)`,[r]).catch(()=>{});
    await q(`delete from journal_entries where source_type='receipt' and source_id=$1`,[r]).catch(()=>{});
    await q(`delete from receipt_allocations where receipt_id=$1`,[r]).catch(()=>{});
    await q(`delete from receipts where id=$1`,[r]).catch(()=>{});
  }
  for (const i of made.inv) { await q(`delete from invoice_lines where invoice_id=$1`,[i]).catch(()=>{}); await q(`delete from invoices where id=$1`,[i]).catch(()=>{}); }
  console.log("\ncleanup done.");
  await pool.end();
}
