import type { Consumer } from "./outbox";

// Registered outbox consumers. Each is idempotent, keyed by (consumer_name,
// event_id). Empty until K2, which registers the contract.activated fan-out
// (schedule + jobs). Later phases add stock, invoice, and dashboard consumers.
export const consumers: Consumer[] = [];
