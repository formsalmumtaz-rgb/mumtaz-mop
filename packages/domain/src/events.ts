// MOP domain events — the single vocabulary of the system (CONTEXT.md §7).
// Defined ONCE here and imported everywhere. Every event carries the envelope
// metadata; payloads are validated per event type with Zod.
import { z } from "zod";

// Naming convention: noun.verb_past_tense
export const EVENT_TYPES = [
  "lead.captured",
  "survey.completed",
  "quotation.issued",
  "quotation.accepted",
  "contract.activated",
  "job.scheduled",
  "route.optimised",
  "job.started",
  "job.arrived",
  "job.completed",
  "job.inspected",
  "job.failed",
  "stock.consumed",
  "stock.transferred",
  "purchase.recorded",
  "expense.recorded",
  "cash.collected",
  "cash.deposited",
  "invoice.issued",
  "payment.received",
  "contract.renewal_due",
  "compliance.expiring",
  "complaint.raised",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// Envelope every event carries (CONTEXT.md §7).
export const EventEnvelope = z.object({
  event_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  event_type: z.enum(EVENT_TYPES),
  aggregate_type: z.string().nullish(),
  entity_id: z.string().uuid().nullish(),
  occurred_at: z.string(), // ISO timestamp
  actor_id: z.string().uuid().nullish(),
  source_device: z.string().nullish(),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

// Payload schemas. Sprint-Zero-critical events are fully specified; the rest are
// permissive placeholders to be tightened when their module is built. Defining
// them here still guarantees one shared contract.
const passthrough = z.object({}).passthrough();

export const payloadSchemas = {
  "contract.activated": z.object({
    contract_id: z.string().uuid(),
    customer_id: z.string().uuid(),
    service_line_id: z.string().uuid(),
    start_date: z.string().nullish(),
    end_date: z.string().nullish(),
    frequency_id: z.string().uuid().nullish(),
  }),
  "job.scheduled": z.object({
    job_id: z.string().uuid(),
    contract_id: z.string().uuid().nullish(),
    branch_id: z.string().uuid().nullish(),
    scheduled_date: z.string(),
  }),
  "job.started": z.object({
    job_id: z.string().uuid(),
    technician_id: z.string().uuid().nullish(),
    device_started_at: z.string().nullish(),
  }),
  "job.inspected": z.object({
    job_id: z.string().uuid(),
    device_time: z.string().nullish(),
    entries: z.array(z.object({
      area: z.string(),
      issue_type: z.string().nullish(),
      hygiene_score: z.number().int().min(1).max(5).nullish(),
      structural_score: z.number().int().min(1).max(5).nullish(),
      infestation_level: z.string().nullish(),
      notes: z.string().nullish(),
    })),
  }),
  "job.completed": z.object({
    job_id: z.string().uuid(),
    client_uuid: z.string().uuid().nullish(),
    device_completed_at: z.string().nullish(),
  }),
  "stock.consumed": z.object({
    job_id: z.string().uuid(),
    item_id: z.string().uuid(),
    quantity: z.number(),
    unit_id: z.string().uuid().nullish(),
  }),
  "purchase.recorded": z.object({
    purchase_id: z.string().uuid(),
    item_id: z.string().uuid(),
    total_cost: z.number().nullish(),
    currency: z.string().nullish(),
  }),
  "invoice.issued": z.object({
    invoice_id: z.string().uuid(),
    contract_id: z.string().uuid().nullish(),
    total: z.number().nullish(),
    currency: z.string().nullish(),
  }),
  "payment.received": z.object({
    payment_id: z.string().uuid().nullish(),
    invoice_id: z.string().uuid().nullish(),
    amount: z.number(),
    currency: z.string().nullish(),
  }),
} as const;

// Fall back to the permissive schema for events not yet fully specified.
export function payloadSchemaFor(type: EventType) {
  return (payloadSchemas as Record<string, z.ZodTypeAny>)[type] ?? passthrough;
}

// Validate a full event (envelope + payload) — throws on invalid.
export function parseEvent(input: unknown): { envelope: EventEnvelope; payload: unknown } {
  const envelope = EventEnvelope.parse(input);
  const raw = (input as { payload?: unknown }).payload ?? {};
  const payload = payloadSchemaFor(envelope.event_type).parse(raw);
  return { envelope, payload };
}
