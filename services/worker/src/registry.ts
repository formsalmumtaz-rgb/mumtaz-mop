import { fanoutConsumers } from "./consumers";
import { billingConsumers } from "./billing";
import { costingConsumers } from "./costing";
import { inspectionConsumers } from "./inspection";
import { materialConsumers } from "./materials";
import { fieldFinanceConsumers } from "./fieldfinance";
import { notifyConsumers } from "./notify";
import type { Consumer } from "./outbox";

// Registered outbox consumers. contract.activated fans out to schedule + jobs +
// renewal (K2); job.completed queues an invoice + deducts stock (K4) + costs the
// job (Tier 1 Item 2 — after the stock deducter so material is posted first).
// Each guards on event type and is idempotent.
export const consumers: Consumer[] = [...fanoutConsumers, ...billingConsumers, ...costingConsumers, ...inspectionConsumers, ...materialConsumers, ...fieldFinanceConsumers, ...notifyConsumers];
