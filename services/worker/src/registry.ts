import { fanoutConsumers } from "./consumers";
import type { Consumer } from "./outbox";

// Registered outbox consumers. K2 fans out contract.activated into schedule +
// jobs + renewal reminder. Later phases append stock, invoice, dashboard consumers.
export const consumers: Consumer[] = [...fanoutConsumers];
