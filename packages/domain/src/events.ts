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
  "job.rescheduled",
  "route.optimised",
  "job.started",
  "job.arrived",
  "job.completed",
  "job.inspected",
  "job.failed",
  "job.cancelled",
  "job.delayed",
  "stock.consumed",
  "stock.transferred",
  "purchase.recorded",
  "expense.recorded",
  "fuel.logged",
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
  "job.rescheduled": z.object({
    job_id: z.string().uuid(),
    from_date: z.string().nullish(),
    to_date: z.string(),
    start_time: z.string().nullish(),
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
  // §3.6 — the two outcomes that are NOT completion. Both demand a reason: the
  // technician is the only person who knows why, and by the time the office asks,
  // the day has moved on. Cancelled closes the visit; delayed sends it back to the
  // office to reschedule, which is the opposite.
  "job.cancelled": z.object({
    job_id: z.string().uuid(),
    client_uuid: z.string().uuid().nullish(),
    reason: z.string().min(1),
    device_time: z.string().nullish(),
  }),
  "job.delayed": z.object({
    job_id: z.string().uuid(),
    client_uuid: z.string().uuid().nullish(),
    reason: z.string().min(1),
    device_time: z.string().nullish(),
  }),
  "fuel.logged": z.object({
    client_uuid: z.string().uuid().nullish(),
    vehicle_id: z.string().uuid(),
    litres: z.number().positive(),
    amount: z.number().min(0),
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
//
// job_id defaulting: field-app events (ingest.ts) carry the job id in the
// envelope's entity_id (the aggregate id, immutable outbox content) while the
// payload holds only the device capture — so a payload schema that requires
// job_id rejected every field job.started/job.completed and the device→invoice/
// stock chain silently stalled (events retried forever). When the envelope is
// job-scoped and the payload lacks job_id, default it from entity_id BEFORE
// validation. Validation is not weakened — the id must still be a UUID, and it
// comes from the authoritative column rather than a duplicated payload field.
export function parseEvent(input: unknown): { envelope: EventEnvelope; payload: unknown } {
  const envelope = EventEnvelope.parse(input);
  const raw = { ...((input as { payload?: Record<string, unknown> }).payload ?? {}) };
  if (raw.job_id == null && envelope.entity_id && (envelope.aggregate_type ?? "job") === "job") {
    raw.job_id = envelope.entity_id;
  }
  const payload = payloadSchemaFor(envelope.event_type).parse(raw);
  return { envelope, payload };
}
