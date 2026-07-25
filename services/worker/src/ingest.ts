import type { Pool } from "pg";

// Ingest events uploaded from the offline field app. Idempotent by client_uuid:
// re-posting an event that already landed (mid-sync drop, or a lost ack where the
// server committed but the device never heard back) is a no-op. Returns every
// client_uuid the server now holds — the device marks those synced, so a re-posted
// already-present event is still "accepted" and never uploaded again.
export interface DeviceEvent {
  client_uuid: string;
  event_type: string;
  job_id: string;
  payload: unknown;
  device_time: string;
}

export async function ingestDeviceEvents(
  pool: Pool,
  tenantId: string,
  events: DeviceEvent[],
): Promise<{ accepted: string[] }> {
  const accepted: string[] = [];
  for (const ev of events) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      // dedup on the partial unique index over client_uuid
      await client.query(
        `insert into outbox_events (tenant_id, event_type, aggregate_type, entity_id, payload, client_uuid, source_device)
         values ($1,$2,'job',$3,$4,$5,'field-pwa')
         on conflict (client_uuid) where client_uuid is not null do nothing`,
        [tenantId, ev.event_type, ev.job_id, JSON.stringify(ev.payload), ev.client_uuid],
      );
      // reflect completion on the job itself (idempotent — only if not already done)
      if (ev.event_type === "job.completed") {
        await client.query(
          `update jobs set status='completed', device_completed_at=$2, completed_at=coalesce(completed_at, now())
            where id=$1 and tenant_id=$3 and status <> 'completed'`,
          [ev.job_id, ev.device_time, tenantId],
        );
      }
      await client.query("commit");
      // server holds it (new or pre-existing) -> device may mark synced
      accepted.push(ev.client_uuid);
    } catch (err) {
      await client.query("rollback");
      // not accepted -> device keeps it pending and retries
      console.error(`[ingest] failed for ${ev.client_uuid}:`, (err as Error).message);
    } finally {
      client.release();
    }
  }
  return { accepted };
}
