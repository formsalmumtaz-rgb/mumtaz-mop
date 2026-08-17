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
    const p = ev.payload as { job_id?: string; amount?: number; note?: string };
    const jobId = p.job_id ?? (ev.envelope.entity_id as string | null);
    if (!jobId || !p.amount || p.amount <= 0) return;
    // Cash receipt against the job's customer. Number issued by the document
    // counter; one receipt per event (exactly-once).
    await c.query(
      `insert into receipts (tenant_id, service_line_id, receipt_number, customer_id, method, amount, others_note)
       select $1, j.service_line_id, fn_next_document_number($1,'RCP'), j.customer_id, 'cash', $2, $3
         from jobs j where j.id = $4 and j.tenant_id = $1`,
      [ev.envelope.tenant_id, p.amount, p.note ?? null, jobId],
    );
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
    };
    if (!p.vehicle_id || !p.litres || p.litres <= 0 || p.amount == null || p.amount < 0) return;
    await c.query(
      `insert into vehicle_fuel_purchases
         (tenant_id, service_line_id, vehicle_id, purchase_date, litres, amount, note, client_uuid, snapshot, created_by)
       select $1, v.service_line_id, v.id, current_date, $2, $3, 'Logged on device (Log Fuel)', $4,
              jsonb_build_object('source', 'field_fuel_log'), $5
         from vehicles v where v.id = $6 and v.tenant_id = $1
       on conflict (tenant_id, client_uuid) where client_uuid is not null do nothing`,
      [ev.envelope.tenant_id, p.litres, p.amount, p.client_uuid ?? null, ev.envelope.actor_id ?? null, p.vehicle_id]);
  },
};

export const fieldFinanceConsumers: Consumer[] = [cashCollector, expenseRecorder, fuelLogger];
