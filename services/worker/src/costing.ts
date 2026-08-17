import type { PoolClient } from "pg";
import type { Consumer, ParsedEvent } from "./outbox";

// On job.completed, cost the job (deterministic SQL engine, fn_cost_job). The
// engine is GATED: it produces nothing while costing config is still ASSUMED, so
// this is a safe no-op until the owner confirms rates/accounts. When the gate
// lifts, fn_cost_jobs_backlog(tenant) retroactively costs everything completed
// beforehand — no permanent gap. Runs after the stock deducter so the job's
// material valuation is already posted when its cost is computed.
export const jobCoster: Consumer = {
  name: "job-coster",
  eventTypes: ["job.completed"],
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "job.completed") return;
    const jobId = (ev.payload as { job_id?: string }).job_id ?? (ev.envelope.entity_id as string) ?? null;
    if (!jobId) return;
    await c.query(`select fn_cost_job($1)`, [jobId]);
  },
};

export const costingConsumers: Consumer[] = [jobCoster];
