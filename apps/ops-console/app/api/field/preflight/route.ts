import { NextResponse } from "next/server";
import { resolveFieldRequest, fieldCors, technicianForUser } from "@/lib/field-auth";
import { getPreflightChecklist, getTodayPreflight, upsertPreflight } from "@/lib/domain/preflight";

// Technician start-of-shift pre-flight (T3). GET returns the configurable
// PPE/equipment checklist + today's record (if any). POST upserts today's record
// for the authenticated technician. Bearer/session re-authorized like the other
// /api/field/* routes; a revoked login is rejected.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const METHODS = "GET,POST,OPTIONS";
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_BEHIND_MS = 3 * 24 * 60 * 60 * 1000;

function suspect(deviceTime?: string | null): boolean {
  if (!deviceTime) return false;
  const t = Date.parse(deviceTime);
  if (Number.isNaN(t)) return true;
  const skew = t - Date.now();
  return skew > FUTURE_SKEW_MS || -skew > MAX_BEHIND_MS;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: fieldCors(req, METHODS) });
}

export async function GET(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth || auth.revoked) return NextResponse.json({ error: auth ? "revoked" : "unauthenticated" }, { status: 401, headers: auth?.revoked ? { ...cors, "x-mop-revoked": "1" } : cors });
  const tech = await technicianForUser(auth.session);
  const checklist = await getPreflightChecklist(auth.session.tenantId);
  const today = tech ? await getTodayPreflight(auth.session.tenantId, tech.id) : null;
  return NextResponse.json({ checklist, today, hasTechnician: !!tech }, { headers: cors });
}

export async function POST(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  if (auth.revoked) return NextResponse.json({ error: "revoked" }, { status: 401, headers: { ...cors, "x-mop-revoked": "1" } });
  const tech = await technicianForUser(auth.session);
  if (!tech) return NextResponse.json({ error: "no technician linked to this login" }, { status: 403, headers: cors });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  await upsertPreflight(auth.session.tenantId, auth.session.userId, {
    technicianId: tech.id,
    serviceLineId: tech.service_line_id,
    check_date: (b.check_date as string) ?? null,
    present: b.present !== false,
    vehicle_id: (b.vehicle_id as string) ?? null,
    odometer_km: b.odometer_km != null ? Number(b.odometer_km) : null,
    fuel_litres: b.fuel_litres != null ? Number(b.fuel_litres) : null,
    fuel_amount: b.fuel_amount != null ? Number(b.fuel_amount) : null,
    ppe: (b.ppe as Record<string, boolean>) ?? {},
    equipment: (b.equipment as Record<string, boolean>) ?? {},
    notes: (b.notes as string) ?? null,
    client_uuid: (b.client_uuid as string) ?? null,
    device_time: (b.device_time as string) ?? null,
    time_suspect: suspect(b.device_time as string | null),
  });
  return NextResponse.json({ ok: true }, { headers: cors });
}
