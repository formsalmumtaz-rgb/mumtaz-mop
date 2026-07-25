import { fanoutConsumers } from "./consumers";
import { billingConsumers } from "./billing";
import type { Consumer } from "./outbox";

// Registered outbox consumers. contract.activated fans out to schedule + jobs +
// renewal (K2); job.completed queues an invoice + deducts stock (K4). Each guards
// on event type and is idempotent.
export const consumers: Consumer[] = [...fanoutConsumers, ...billingConsumers];
