import { NextResponse } from "next/server";
import { ingestDeviceEvents, type DeviceEvent } from "@mop/worker";
import { pool } from "@/lib/db";
import { getTenantId } from "@/lib/tenant";

// Receives the field app's queued events on reconnect. Idempotent by client_uuid
// (ingestDeviceEvents) — safe to re-post after an interrupted sync. Returns the
// UUIDs the server now holds; the device marks exactly those synced.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}

export async function POST(req: Request) {
  const tenantId = await getTenantId();
  const body = (await req.json().catch(() => ({ events: [] }))) as { events?: DeviceEvent[] };
  const events = body.events ?? [];
  const { accepted } = await ingestDeviceEvents(pool, tenantId, events);
  return NextResponse.json({ accepted }, { headers: cors });
}
