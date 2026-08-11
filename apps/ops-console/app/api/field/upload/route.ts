import { NextResponse } from "next/server";
import { ingestDeviceEvents, type DeviceEvent } from "@mop/worker";
import { pool } from "@/lib/db";
import { fieldSession, fieldCors, assignedJobIds } from "@/lib/field-auth";

// Receives the field app's queued events on reconnect. Idempotent by client_uuid
// (ingestDeviceEvents) — safe to re-post after an interrupted sync.
//
// Security (previously an anonymous tenant-wide WRITE — anyone could post fake
// completions/consumption): requires a session, and each event is accepted only if
// its job is assigned to a technician the session user operates as. Events for
// other jobs (or with no job) are rejected, not silently written.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const METHODS = "POST,OPTIONS";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: fieldCors(req, METHODS) });
}

export async function POST(req: Request) {
  const cors = fieldCors(req, METHODS);
  const session = await fieldSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  }

  const body = (await req.json().catch(() => ({ events: [] }))) as { events?: DeviceEvent[] };
  const events = body.events ?? [];

  // Authorise each event against the caller's own assignments before it touches
  // the database. The ownership check runs under RLS (assignedJobIds -> scopedRead).
  const jobIds = events.map((e) => (e as { job_id?: string }).job_id ?? "");
  const mine = await assignedJobIds(session, jobIds);
  const authorised = events.filter((e) => mine.has((e as { job_id?: string }).job_id ?? ""));
  const rejected = events.length - authorised.length;

  const { accepted } = await ingestDeviceEvents(pool, session.tenantId, authorised);
  return NextResponse.json({ accepted, rejected }, { headers: cors });
}
