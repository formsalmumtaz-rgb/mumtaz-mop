import { NextResponse } from "next/server";
import { ingestDeviceEvents, type DeviceEvent } from "@mop/worker";
import { pool } from "@/lib/db";
import { resolveFieldRequest, fieldCors, assignedJobIds } from "@/lib/field-auth";

// Receives the field app's queued events on reconnect. Idempotent by client_uuid
// (ingestDeviceEvents) — safe to re-post after an interrupted sync.
//
// Security: requires a valid Bearer/session (server re-authorizes, DECISIONS
// §11.5); each event is accepted only if its job is assigned to a technician the
// actor operates as — events for other jobs are rejected. Events from a REVOKED
// login are still ingested but HELD needs_review (ingest stamps them), so offline
// work already done reaches an admin flagged, never silently discarded (T1).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const METHODS = "POST,OPTIONS";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: fieldCors(req, METHODS) });
}

export async function POST(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  }
  const { session, revoked } = auth;

  const body = (await req.json().catch(() => ({ events: [] }))) as { events?: DeviceEvent[] };
  const events = body.events ?? [];

  // Authorise each event against the caller's own assignments before it touches
  // the database. The ownership check runs under RLS (assignedJobIds -> scopedRead).
  const jobIds = events.map((e) => (e as { job_id?: string }).job_id ?? "");
  const mine = await assignedJobIds(session, jobIds);
  const authorised = events.filter((e) => mine.has((e as { job_id?: string }).job_id ?? ""));
  const rejected = events.length - authorised.length;

  // Revoked login: events are ingested but held needs_review (not discarded).
  const { accepted, flagged, heldForReview } = await ingestDeviceEvents(
    pool, session.tenantId, authorised, { actorId: session.userId, actorRevoked: revoked },
  );
  return NextResponse.json(
    { accepted, rejected, flagged, heldForReview, revoked },
    { headers: revoked ? { ...cors, "x-mop-revoked": "1" } : cors },
  );
}
