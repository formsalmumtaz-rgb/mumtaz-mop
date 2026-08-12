import type { PoolClient } from "pg";
import type { Consumer, ParsedEvent } from "./outbox";

// Field money events (T5). Cash collected at a job -> a cash receipt; an expense
// incurred -> a submitted expense claim (needs approval, mig 045). Both idempotent:
// the exactly-once claim runs each consumer once per event, and the expense also
// dedups on its client_uuid.

export const cashCollector: Consumer = {
  name: "cash-collector",
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
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "expense.recorded") return;
    const p = ev.payload as {
      job_id?: string; client_uuid?: string; amount?: number; category_id?: string | null;
      description?: string; expense_date?: string; vehicle_id?: string | null;
    };
    if (!p.amount || p.amount <= 0) return;
    const jobId = p.job_id ?? (ev.envelope.entity_id as string | null);
    // Submitted expense claim by the technician who incurred it. Dedup on
    // client_uuid so an offline re-sync never double-books.
    await c.query(
      `insert into expenses
         (tenant_id, service_line_id, category_id, expense_date, amount, description,
          vehicle_id, job_id, technician_id, status, client_uuid, created_by)
       select $1, j.service_line_id, $2, coalesce($3::date, current_date), $4, $5,
              $6, j.id, t.id, 'submitted', $7, $8
         from jobs j
         left join technicians t on t.tenant_id = $1 and t.user_id = $8
        where j.id = $9 and j.tenant_id = $1
       on conflict (tenant_id, client_uuid) do nothing`,
      [ev.envelope.tenant_id, p.category_id ?? null, p.expense_date ?? null, p.amount,
       p.description ?? null, p.vehicle_id ?? null, p.client_uuid ?? null, ev.envelope.actor_id ?? null, jobId],
    );
  },
};

export const fieldFinanceConsumers: Consumer[] = [cashCollector, expenseRecorder];
