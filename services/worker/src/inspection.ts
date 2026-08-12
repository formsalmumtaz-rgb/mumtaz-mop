import type { PoolClient } from "pg";
import type { Consumer, ParsedEvent } from "./outbox";

// Writes the technician's post-inspection (T4) into the append-only
// job_inspections table — one row per assessed area. Idempotent: the exactly-once
// claim runs it once, and `on conflict (event_id, area)` makes any replay a no-op.
interface Entry {
  area: string;
  issue_type?: string | null;
  hygiene_score?: number | null;
  structural_score?: number | null;
  infestation_level?: string | null;
  notes?: string | null;
}

export const inspectionRecorder: Consumer = {
  name: "inspection-recorder",
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "job.inspected") return;
    const p = ev.payload as { job_id?: string; device_time?: string; entries?: Entry[] };
    const jobId = p.job_id ?? (ev.envelope.entity_id as string | null);
    if (!jobId) return;
    for (const e of p.entries ?? []) {
      await c.query(
        `insert into job_inspections
           (tenant_id, service_line_id, job_id, event_id, area, issue_type,
            hygiene_score, structural_score, infestation_level, notes, device_time, created_by)
         select $1, j.service_line_id, j.id, $2, $3, $4, $5, $6, $7, $8, $9, $10
           from jobs j where j.id = $11 and j.tenant_id = $1
         on conflict (event_id, area) do nothing`,
        [ev.envelope.tenant_id, ev.envelope.event_id, e.area, e.issue_type ?? null,
         e.hygiene_score ?? null, e.structural_score ?? null, e.infestation_level ?? null,
         e.notes ?? null, p.device_time ?? null, ev.envelope.actor_id ?? null, jobId],
      );
    }
  },
};

export const inspectionConsumers: Consumer[] = [inspectionRecorder];
