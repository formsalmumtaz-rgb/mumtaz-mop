import type { PoolClient } from "pg";
import type { Consumer, ParsedEvent } from "./outbox";

// K4 — on job.completed: queue an invoice (pricing-model correct) and deduct stock
// (append-only) from the frozen snapshot. Both idempotent; both guard on event type.

function jobIdOf(ev: ParsedEvent): string | null {
  return (ev.payload as { job_id?: string }).job_id ?? (ev.envelope.entity_id as string) ?? null;
}

const VAT_RATE = 5; // % — frozen onto the invoice at issue (UAE standard). Settings-driven later.

// Queue an invoice. per_treatment bills per visit (per_visit_price). fixed_period
// is covered by the periodic contract fee — NO per-visit invoice (that would
// double-bill an annual contract). Buyer tax identity frozen at issue (F3).
const invoiceQueuer: Consumer = {
  name: "invoice-queuer",
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "job.completed") return;
    const jobId = jobIdOf(ev);
    if (!jobId) return;

    // idempotency: at most one invoice per job
    const exists = await c.query(`select 1 from invoices where job_id = $1 limit 1`, [jobId]);
    if (exists.rowCount) return;

    const { rows } = await c.query(
      `select j.tenant_id, j.service_line_id, j.customer_id, j.contract_id, j.generation_snapshot,
              cu.legal_name, cu.trade_name, cu.trn, cu.emirate, cu.customer_type,
              ct.vat_treatment
         from jobs j
         join customers cu on cu.id = j.customer_id
         left join contracts ct on ct.id = j.contract_id
        where j.id = $1`,
      [jobId],
    );
    const j = rows[0];
    if (!j) return;

    const pricing = (j.generation_snapshot?.pricing ?? {}) as {
      billing?: string; per_visit_price?: number; currency?: string; pricing_model?: string;
    };
    // Only invoice per-visit work here. Fixed-period is billed on the contract's
    // periodic schedule, not per job.
    if (pricing.billing !== "per_visit") return;

    const subtotal = Number(pricing.per_visit_price ?? 0) || 0;
    const currency = pricing.currency ?? "AED";
    const vat = Math.round(subtotal * VAT_RATE) / 100;
    const total = subtotal + vat;

    const { rows: invRows } = await c.query(
      `insert into invoices
         (tenant_id, service_line_id, customer_id, contract_id, job_id, status,
          buyer_legal_name, buyer_trn, buyer_address, buyer_customer_type,
          currency, vat_treatment, subtotal, vat_total, total, snapshot)
       values ($1,$2,$3,$4,$5,'queued',$6,$7,$8,$9,$10,coalesce($11,'standard'),$12,$13,$14,$15)
       returning id`,
      [j.tenant_id, j.service_line_id, j.customer_id, j.contract_id, jobId,
       j.legal_name ?? j.trade_name, j.trn, j.emirate, j.customer_type,
       currency, j.vat_treatment, subtotal, vat, total,
       JSON.stringify({ pricing, vat_rate: VAT_RATE, frozen_at: new Date().toISOString(), source: "job.completed" })],
    );
    await c.query(
      `insert into invoice_lines
         (tenant_id, invoice_id, line_no, description, quantity, unit_price, currency, vat_rate, vat_amount, line_total, snapshot)
       values ($1,$2,1,$3,1,$4,$5,$6,$7,$8,$9)`,
      [j.tenant_id, invRows[0].id, "Pest control service (per visit)", subtotal, currency, VAT_RATE, vat, total, JSON.stringify(pricing)],
    );
  },
};

// Deduct stock from the frozen dose snapshot (append-only). No-op when the job has
// no recipe/dose (e.g. recipes not yet seeded). Deduped by the event's client_uuid.
const stockDeducter: Consumer = {
  name: "stock-deducter",
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "job.completed") return;
    const jobId = jobIdOf(ev);
    if (!jobId) return;

    const { rows } = await c.query(
      `select tenant_id, service_line_id, generation_snapshot from jobs where id = $1`,
      [jobId],
    );
    const j = rows[0];
    if (!j) return;
    const dose = j.generation_snapshot?.dose as { item_id?: string; quantity?: number; unit_id?: string } | undefined;
    if (!dose?.item_id || !dose.quantity) return; // nothing to deduct

    // who performed it lives in job_assignments (nullable for now)
    const tech = (await c.query(`select technician_id from job_assignments where job_id = $1 limit 1`, [jobId])).rows[0];
    const clientUuid = (ev.payload as { client_uuid?: string }).client_uuid ?? ev.envelope.event_id;
    await c.query(
      `insert into stock_movements
         (tenant_id, service_line_id, item_id, movement_type, quantity, unit_id, job_id, technician_id, client_uuid, snapshot)
       values ($1,$2,$3,'consumption',$4,$5,$6,$7,$8,$9)
       on conflict (tenant_id, client_uuid) do nothing`,
      [j.tenant_id, j.service_line_id, dose.item_id, dose.quantity, dose.unit_id ?? null, jobId, tech?.technician_id ?? null, clientUuid, JSON.stringify(dose)],
    );
  },
};

export const billingConsumers: Consumer[] = [invoiceQueuer, stockDeducter];
