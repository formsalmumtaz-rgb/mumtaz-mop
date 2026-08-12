import "server-only";
import { scopedRead, withRequest } from "../rls";
import { audit } from "./audit";

// Held field events (T1): device events that arrived from a login revoked while
// the technician was offline. They are NOT discarded — they wait here for an admin
// to approve (release to the drain) or reject (mark processed, never posts).
export interface HeldFieldEvent {
  event_id: string;
  event_type: string;
  job_id: string | null;
  device_time: string | null;
  server_received_at: string;
  time_suspect: boolean;
  review_reason: string | null;
  actor_name: string | null;
}

export async function listHeldFieldEvents(tenantId: string): Promise<HeldFieldEvent[]> {
  const { rows } = await scopedRead(tenantId,
    `select o.event_id, o.event_type, o.entity_id as job_id,
            o.device_time::text as device_time, o.server_received_at::text as server_received_at,
            o.time_suspect, o.review_reason, u.full_name as actor_name
       from outbox_events o
       left join app_users u on u.id = o.actor_id
      where o.tenant_id = $1 and o.needs_review and o.processed_at is null
      order by o.server_received_at desc`,
    [tenantId],
  );
  return rows as HeldFieldEvent[];
}

// Approve: clear needs_review so the drain processes the event normally.
export async function approveHeldFieldEvent(tenantId: string, actorId: string, eventId: string): Promise<void> {
  await withRequest({ tenantId, actorId }, async (c) => {
    const before = (await c.query(
      `select review_reason from outbox_events where event_id=$1 and tenant_id=$2 and needs_review and processed_at is null for update`,
      [eventId, tenantId])).rows[0];
    if (!before) throw new Error("Event not found or not held");
    await c.query(`update outbox_events set needs_review=false, review_reason=concat_ws(' — ', review_reason, 'approved for processing') where event_id=$1`, [eventId]);
    await audit(c, tenantId, { table: "outbox_events", rowId: eventId, action: "update", oldValue: before, newValue: { needs_review: false }, note: "held field event approved" });
  });
}

// Reject: mark processed (so the drain skips it forever) without running consumers
// — the event never posts to the ledger/inventory. Append-only: the row stays.
export async function rejectHeldFieldEvent(tenantId: string, actorId: string, eventId: string): Promise<void> {
  await withRequest({ tenantId, actorId }, async (c) => {
    const before = (await c.query(
      `select review_reason from outbox_events where event_id=$1 and tenant_id=$2 and needs_review and processed_at is null for update`,
      [eventId, tenantId])).rows[0];
    if (!before) throw new Error("Event not found or not held");
    await c.query(`update outbox_events set needs_review=false, processed_at=now(), review_reason=concat_ws(' — ', review_reason, 'rejected by admin') where event_id=$1`, [eventId]);
    await audit(c, tenantId, { table: "outbox_events", rowId: eventId, action: "update", oldValue: before, newValue: { rejected: true }, note: "held field event rejected — will not post" });
  });
}
