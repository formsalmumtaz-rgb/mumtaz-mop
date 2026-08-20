import type { PoolClient } from "pg";
import type { Consumer, ParsedEvent } from "./outbox";
import { resolveStrategy, postConsumptionValuation } from "./inventory";

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
  eventTypes: ["job.completed"],
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

// Deduct stock from the frozen dose snapshot (append-only) and value it at the
// consumed batch's cost. No-op when the job has no recipe/dose. Deduped by the
// event's client_uuid. Vehicle inventory is the operational source: the batch is
// picked from the technician's van under the tenant's allocation strategy
// (FEFO/FIFO/manual). Valuation posts ONE balanced entry per consumption — and
// only when a costed batch was allocated and inventory accounts are configured,
// so tenants without inventory set up behave exactly as before.
const stockDeducter: Consumer = {
  name: "stock-deducter",
  eventTypes: ["job.completed"],
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

    // The technician's own recorded use (job.materials_recorded, defect 2B) is the
    // better number and has already moved the stock. Deducting the office's planned
    // dose on top of it would consume the van twice for one visit.
    const recorded = await c.query(`select 1 from job_material_usage where job_id = $1 limit 1`, [jobId]);
    if ((recorded.rowCount ?? 0) > 0) return;

    // who performed it lives in job_assignments (nullable for now)
    const tech = (await c.query(`select technician_id from job_assignments where job_id = $1 limit 1`, [jobId])).rows[0];
    const techId = tech?.technician_id ?? null;

    // vehicle inventory is the operational source of consumption: the technician's van
    let vanId: string | null = null;
    if (techId) {
      vanId = (await c.query(`select fn_technician_van($1,$2) as id`, [j.tenant_id, techId])).rows[0]?.id ?? null;
    }

    // deterministic batch pick from that van's on-hand (FEFO/FIFO; null under 'manual'
    // or when the van holds no on-hand lot for the item)
    let batchId: string | null = null;
    if (vanId) {
      const strategy = await resolveStrategy(c, j.tenant_id, j.service_line_id);
      const picked = (await c.query(`select fn_alloc_batch($1,$2,$3,$4) as b`, [j.tenant_id, dose.item_id, vanId, strategy])).rows[0];
      batchId = picked?.b ?? null;
    }

    const clientUuid = (ev.payload as { client_uuid?: string }).client_uuid ?? ev.envelope.event_id;
    const ins = await c.query(
      `insert into stock_movements
         (tenant_id, service_line_id, item_id, batch_id, from_location_id, movement_type, quantity, unit_id, job_id, technician_id, client_uuid, snapshot)
       values ($1,$2,$3,$4,$5,'consumption',$6,$7,$8,$9,$10,$11)
       on conflict (tenant_id, client_uuid) do nothing
       returning id`,
      [j.tenant_id, j.service_line_id, dose.item_id, batchId, vanId, dose.quantity, dose.unit_id ?? null, jobId, techId, clientUuid, JSON.stringify(dose)],
    );

    // Value the consumption only when we actually inserted the movement (rowCount 1)
    // and a costed batch was allocated — one balanced entry, idempotent on replay.
    if (ins.rowCount === 1 && batchId) {
      await postConsumptionValuation(c, { tenantId: j.tenant_id, serviceLineId: j.service_line_id, movementId: ins.rows[0].id });
    }
  },
};

export const billingConsumers: Consumer[] = [invoiceQueuer, stockDeducter];

// ── Recurring contract billing (scheduled) ────────────────────────────────
// Deterministic, idempotent date-driven generation. Delegates to the in-DB
// engine (fn_run_contract_billing) so all billing logic lives in one place.
// Safe to run repeatedly.
export async function runContractBilling(
  db: { query: (q: string, p?: unknown[]) => Promise<{ rows: { n: number }[] }> },
  tenantId: string,
  asOf?: string,
): Promise<number> {
  const { rows } = await db.query(`select fn_run_contract_billing($1, coalesce($2::date, current_date)) as n`, [tenantId, asOf ?? null]);
  return rows[0].n;
}

// Run recurring billing for every tenant (the scheduled sweep entry point).
export async function runAllContractBilling(
  db: { query: (q: string, p?: unknown[]) => Promise<{ rows: Array<{ id?: string; n?: number }> }> },
  asOf?: string,
): Promise<number> {
  const { rows } = await db.query(`select id from tenants`);
  let total = 0;
  for (const t of rows) total += await runContractBilling(db as never, t.id as string, asOf);
  return total;
}
