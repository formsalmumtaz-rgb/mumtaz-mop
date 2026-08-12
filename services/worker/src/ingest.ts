import type { Pool } from "pg";

// Ingest events uploaded from the offline field app. Idempotent by client_uuid:
// re-posting an event that already landed (mid-sync drop, or a lost ack where the
// server committed but the device never heard back) is a no-op. Returns every
// client_uuid the server now holds — the device marks those synced, so a re-posted
// already-present event is still "accepted" and never uploaded again.
//
// Provenance (Art. VII §4): each row stores the device clock (device_time) AND the
// server receipt clock (server_received_at, DB default now()). A device clock that
// looks implausible is flagged time_suspect — the event still processes, but the
// flag is visible for review; it is never silently accepted. Events from a login
// that was revoked while offline arrive needs_review=true — HELD from the drain so
// they do not auto-post until an admin approves; never silently discarded.
export interface DeviceEvent {
  client_uuid: string;
  event_type: string;
  job_id: string;
  payload: unknown;
  device_time: string;
}

export interface IngestContext {
  actorId: string;          // the login actor (app_users.id) this device authenticated as
  actorRevoked?: boolean;   // the login was deactivated after the work was done offline
}

// Clock-drift tolerances (ASSUMED — see BLOCKED.md A1). Technical tolerances, not
// a business rule: a phone whose clock is further off than these gets flagged.
const FUTURE_SKEW_MS = 5 * 60 * 1000;            // 5 minutes ahead of the server
const MAX_BEHIND_MS = 3 * 24 * 60 * 60 * 1000;   // 3 days behind the server

// Assess the device clock against the server clock; returns the suspect flag + a
// short reason (null when plausible).
export function assessDeviceTime(deviceTimeIso: string, serverNow = new Date()): { suspect: boolean; reason: string | null } {
  const t = Date.parse(deviceTimeIso);
  if (Number.isNaN(t)) return { suspect: true, reason: "device time unparseable" };
  const skew = t - serverNow.getTime();
  if (skew > FUTURE_SKEW_MS) return { suspect: true, reason: "device clock is in the future" };
  if (-skew > MAX_BEHIND_MS) return { suspect: true, reason: "device clock is far behind" };
  return { suspect: false, reason: null };
}

export async function ingestDeviceEvents(
  pool: Pool,
  tenantId: string,
  events: DeviceEvent[],
  ctx: IngestContext,
): Promise<{ accepted: string[]; flagged: number; heldForReview: number }> {
  const accepted: string[] = [];
  let flagged = 0;
  let heldForReview = 0;
  for (const ev of events) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { suspect, reason: timeReason } = assessDeviceTime(ev.device_time);
      const needsReview = !!ctx.actorRevoked;
      const reason = [needsReview ? "revoked login" : null, timeReason].filter(Boolean).join("; ") || null;
      // dedup on the partial unique index over client_uuid
      const ins = await client.query(
        `insert into outbox_events
           (tenant_id, event_type, aggregate_type, entity_id, payload, client_uuid, source_device,
            actor_id, device_time, time_suspect, needs_review, review_reason)
         values ($1,$2,'job',$3,$4,$5,'field-pwa',$6,$7,$8,$9,$10)
         on conflict (client_uuid) where client_uuid is not null do nothing`,
        [tenantId, ev.event_type, ev.job_id, JSON.stringify(ev.payload), ev.client_uuid,
         ctx.actorId, ev.device_time || null, suspect, needsReview, reason],
      );
      const wasNew = (ins.rowCount ?? 0) > 0;
      if (wasNew && suspect) flagged++;
      if (wasNew && needsReview) heldForReview++;
      // reflect completion on the job itself (idempotent — only if not already done).
      // Held (revoked) events do NOT touch the job until an admin approves.
      if (ev.event_type === "job.completed" && !needsReview) {
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
  return { accepted, flagged, heldForReview };
}
