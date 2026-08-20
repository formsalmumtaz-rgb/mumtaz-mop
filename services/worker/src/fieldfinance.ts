import type { PoolClient } from "pg";
import type { Consumer, ParsedEvent } from "./outbox";

// Field money events (T5). Cash collected at a job -> a cash receipt; an expense
// incurred -> a submitted expense claim (needs approval, mig 045). Both idempotent:
// the exactly-once claim runs each consumer once per event, and the expense also
// dedups on its client_uuid.

export const cashCollector: Consumer = {
  name: "cash-collector",
  eventTypes: ["cash.collected"],
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "cash.collected") return;
    const p = ev.payload as { job_id?: string; amount?: number; note?: string; method?: string };
    const jobId = p.job_id ?? (ev.envelope.entity_id as string | null);
    if (!jobId || !p.amount || p.amount <= 0) return;
    const tenantId = ev.envelope.tenant_id;

    // §3.6 — RECORD WHAT WAS ACTUALLY RECEIVED, and put it somewhere real.
    // This used to insert a bare receipt: not allocated to any invoice and never
    // posted to the ledger, so cash taken at the door left AR untouched and the
    // books short. It now settles the job's own invoice as far as the money goes.
    //
    //   paid < balance  -> the shortfall stays in AR as an unpaid balance
    //   paid > balance  -> the excess is money on account (credited to advances)
    // fn_record_receipt enforces the rest: never allocate more than was received,
    // never more than the invoice owes.
    const { rows: inv } = await c.query(
      `select i.id, ar.balance::numeric as balance, j.customer_id
         from jobs j
         left join invoices i on i.job_id = j.id and i.status in ('issued','queued')
         left join invoice_ar ar on ar.invoice_id = i.id
        where j.id = $1 and j.tenant_id = $2`,
      [jobId, tenantId],
    );
    const target = inv[0];
    if (!target?.customer_id) return;

    const balance = target.balance != null ? Number(target.balance) : 0;
    const applied = target.id && balance > 0 ? Math.min(Number(p.amount), balance) : 0;
    const allocations = applied > 0 ? [{ invoice_id: target.id, amount: applied }] : [];

    const { rows: r } = await c.query(
      `select fn_record_receipt($1,$2,current_date,$3,$4,null,$5,$6::jsonb) as id`,
      [tenantId, target.customer_id, p.method ?? "cash", p.amount, p.note ?? null, JSON.stringify(allocations)],
    );
    // The voucher the technician hands over is this receipt: numbered by the
    // document counter inside fn_record_receipt, and now in the books too.
    //
    // Who physically took the money (mig 134). The actor is the login the device
    // authenticated as; the technician is whoever that login operates as. Stamped
    // here rather than typed, so it cannot be got wrong or left out.
    await c.query(
      `update receipts set collected_by_technician_id = t.id
         from technicians t
        where receipts.id = $1
          and t.tenant_id = receipts.tenant_id
          and t.user_id = $2`,
      [r[0].id, ev.envelope.actor_id ?? null],
    );

    // The RECEIPT is the primary fact — a technician took money and the customer
    // has the voucher. Posting is downstream of that. If the ledger cannot accept
    // it yet (a tenant with no chart of accounts configured), the receipt must
    // still stand: rolling the whole consumer back would discard a record of cash
    // that has physically changed hands. The savepoint keeps the receipt and lets
    // the posting fail on its own; fn_post_receipt_gl is idempotent, so a later
    // run posts it once the accounts exist. Anything OTHER than a configuration
    // gap is re-raised — a real posting bug must still be loud.
    await c.query("savepoint post_gl");
    try {
      await c.query(`select fn_post_receipt_gl($1)`, [r[0].id]);
      await c.query("release savepoint post_gl");
    } catch (err) {
      await c.query("rollback to savepoint post_gl");
      const msg = (err as Error).message;
      if (!/GL accounts not configured/i.test(msg)) throw err;
      console.error(
        `[field-finance] receipt recorded but NOT posted to the ledger: ${msg}. ` +
        `Configure gl.account_code.bank and gl.account_code.receivable; the posting is idempotent and will apply on the next run.`);
    }
  },
};

export const expenseRecorder: Consumer = {
  name: "expense-recorder",
  eventTypes: ["expense.recorded"],
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "expense.recorded") return;
    const p = ev.payload as {
      job_id?: string; client_uuid?: string; amount?: number; category_id?: string | null;
      description?: string; expense_date?: string; vehicle_id?: string | null;
      approved_by_name?: string | null; receipt_media_id?: string | null;
    };
    if (!p.amount || p.amount <= 0) return;
    const jobId = p.job_id ?? (ev.envelope.entity_id as string | null);
    // Submitted expense claim by the technician who incurred it. Dedup on
    // client_uuid so an offline re-sync never double-books. The job link is
    // OPTIONAL — a standalone purchase (item 3A) still books.
    const { rows } = await c.query(
      `insert into expenses
         (tenant_id, service_line_id, category_id, expense_date, amount, description,
          approved_by_name, vehicle_id, job_id, technician_id, status, client_uuid, created_by)
       select $1, coalesce(j.service_line_id, t.service_line_id), $2, coalesce($3::date, current_date), $4, $5,
              $6, $7, j.id, t.id, 'submitted', $8, $9
         from (select 1) one
         left join jobs j on j.id = $10 and j.tenant_id = $1
         left join technicians t on t.tenant_id = $1 and t.user_id = $9
       on conflict (tenant_id, client_uuid) do nothing
       returning id`,
      [ev.envelope.tenant_id, p.category_id ?? null, p.expense_date ?? null, p.amount,
       p.description ?? null, p.approved_by_name ?? null, p.vehicle_id ?? null,
       p.client_uuid ?? null, ev.envelope.actor_id ?? null, jobId],
    );
    // Link the receipt photo file captured on device (uploaded separately to R2
    // under the expense's client identity).
    if (rows[0] && p.client_uuid) {
      await c.query(
        `update expense_receipt_files set expense_id = $2
          where tenant_id = $1 and client_uuid = $3 and expense_id is null`,
        [ev.envelope.tenant_id, rows[0].id, p.client_uuid]);
    }
  },
};

// Item 3B — Log Fuel: a fuel purchase recorded on device posts straight to the
// vehicle fuel ledger (append-only), idempotent by the device capture id.
export const fuelLogger: Consumer = {
  name: "fuel-logger",
  eventTypes: ["fuel.logged"],
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "fuel.logged") return;
    const p = ev.payload as {
      client_uuid?: string; vehicle_id?: string; litres?: number; amount?: number;
      paid_by_technician_id?: string; payment_source?: string;
      receipt_photo_key?: string; fuel_band?: number; odometer_km?: number;
    };
    if (!p.vehicle_id || !p.litres || p.litres <= 0 || p.amount == null || p.amount < 0) return;
    // §3.8 — the payer is recorded, not inferred from the vehicle. A crew that
    // fuels someone else's van out of their own float is owed that money back,
    // and fuel_cash_owed_to_technicians reads THIS column to work it out.
    await c.query(
      `insert into vehicle_fuel_purchases
         (tenant_id, service_line_id, vehicle_id, purchase_date, litres, amount, note, client_uuid,
          snapshot, created_by, paid_by_technician_id, payment_source, receipt_photo_key, fuel_band, odometer_km)
       select $1, v.service_line_id, v.id, current_date, $2, $3, 'Logged on device (Log Fuel)', $4,
              jsonb_build_object('source', 'field_fuel_log'), $5, $7, $8, $9, $10, $11
         from vehicles v where v.id = $6 and v.tenant_id = $1
       on conflict (tenant_id, client_uuid) where client_uuid is not null do nothing`,
      [ev.envelope.tenant_id, p.litres, p.amount, p.client_uuid ?? null, ev.envelope.actor_id ?? null, p.vehicle_id,
       p.paid_by_technician_id ?? null, p.payment_source ?? null, p.receipt_photo_key ?? null,
       p.fuel_band ?? null, p.odometer_km ?? null]);
  },
};


// §3.6 — the technician raises the invoice at completion. The amount is what was
// agreed at the door; VAT is applied here so the rate can never drift from the
// rest of the ledger. Issued immediately, because the customer is standing there
// and needs the document — the technician pressing the button IS the human
// trigger the "never auto-generated" rule asks for.
export const invoiceAtCompletion: Consumer = {
  name: "invoice-at-completion",
  eventTypes: ["job.invoiced"],
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "job.invoiced") return;
    const p = ev.payload as { job_id?: string; amount?: number; description?: string };
    const jobId = p.job_id ?? (ev.envelope.entity_id as string | null);
    if (!jobId || !p.amount || p.amount <= 0) return;
    const tenantId = ev.envelope.tenant_id;

    // one invoice per job, whatever the sync does
    const dup = await c.query(`select 1 from invoices where job_id=$1 and status <> 'cancelled' limit 1`, [jobId]);
    if (dup.rowCount) return;

    const { rows: j } = await c.query(
      `select j.service_line_id, j.customer_id, j.contract_id,
              cu.legal_name, cu.trade_name, cu.trn, cu.emirate, cu.customer_type
         from jobs j join customers cu on cu.id = j.customer_id
        where j.id = $1 and j.tenant_id = $2`, [jobId, tenantId]);
    if (!j[0]) return;
    const subtotal = Math.round(Number(p.amount) * 100) / 100;
    const vat = Math.round(subtotal * 5) / 100;

    const { rows: inv } = await c.query(
      `insert into invoices (tenant_id, service_line_id, customer_id, contract_id, job_id, status,
                             buyer_legal_name, buyer_trn, buyer_address, buyer_customer_type,
                             currency, vat_treatment, subtotal, vat_total, total, snapshot)
       values ($1,$2,$3,$4,$5,'queued',$6,$7,$8,$9,'AED','standard',$10,$11,$12,$13)
       returning id`,
      [tenantId, j[0].service_line_id, j[0].customer_id, j[0].contract_id, jobId,
       j[0].legal_name ?? j[0].trade_name, j[0].trn, j[0].emirate, j[0].customer_type,
       subtotal, vat, subtotal + vat,
       JSON.stringify({ source: "job.invoiced", raised_by: "technician", vat_rate: 5 })]);
    await c.query(
      `insert into invoice_lines (tenant_id, invoice_id, line_no, description, quantity, unit_price,
                                  currency, vat_rate, vat_amount, line_total)
       values ($1,$2,1,$3,1,$4,'AED',5,$5,$6)`,
      [tenantId, inv[0].id, p.description ?? "Pest control service", subtotal, vat, subtotal + vat]);
    await c.query(`select fn_apply_attestation_charge($1)`, [inv[0].id]);

    // An invoice against a job may only be ISSUED once a completed service report
    // exists — no invoice without evidence the work happened (mig 034). The gate
    // is asked BEFORE issuing rather than crashed into: a technician who raises
    // the invoice before filing the report should get a prepared invoice waiting
    // for it, not an event that fails on every drain forever. The office (or the
    // technician, once the report syncs) issues it from the invoices screen.
    const { rows: gate } = await c.query(
      `select fn_job_service_report_ok($1, $2,
                coalesce((select value::text::boolean from settings
                           where tenant_id=$1 and service_line_id is null
                             and key='ar.require_sr_approval'), false)) as ok`,
      [tenantId, jobId]);
    if (gate[0]?.ok) {
      await c.query(`select fn_issue_invoice($1)`, [inv[0].id]);
      await c.query(`select fn_post_invoice_gl($1)`, [inv[0].id]);
    }
  },
};

export const fieldFinanceConsumers: Consumer[] =
  [cashCollector, expenseRecorder, fuelLogger, invoiceAtCompletion];
