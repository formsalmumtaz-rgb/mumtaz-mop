import { NextResponse } from "next/server";
import { resolveFieldRequest, fieldCors, technicianForUser } from "@/lib/field-auth";
import { withRequest } from "@/lib/rls";

// §3.7 — sick leave and other HR requests, raised from the app.
//
// Idempotent by client_uuid like every other field write, so a request made in a
// basement and synced three times is one request. A technician may only ever
// raise a request for THEMSELVES: the technician id comes from the session, never
// from the body.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const METHODS = "POST,OPTIONS";
const KINDS = ["sick_leave", "annual_leave", "unpaid_leave", "advance", "document", "other"];

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: fieldCors(req, METHODS) });
}

export async function POST(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  if (auth.revoked) return NextResponse.json({ error: "revoked" }, { status: 401, headers: { ...cors, "x-mop-revoked": "1" } });
  const tech = await technicianForUser(auth.session);
  if (!tech) return NextResponse.json({ error: "no technician linked to this login" }, { status: 403, headers: cors });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(b.kind ?? "");
  const reason = String(b.reason ?? "").trim();
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "unknown request type" }, { status: 400, headers: cors });
  if (!reason) return NextResponse.json({ error: "a reason is required" }, { status: 400, headers: cors });
  if (kind.endsWith("leave") && !b.from_date) {
    return NextResponse.json({ error: "leave needs a start date" }, { status: 400, headers: cors });
  }

  const id = await withRequest({ tenantId: auth.session.tenantId, actorId: auth.session.userId }, async (c) => {
    const { rows } = await c.query(
      `insert into hr_requests (tenant_id, technician_id, kind, from_date, to_date, reason, client_uuid, device_time)
       values ($1,$2,$3,$4::date,$5::date,$6,$7::uuid,$8)
       on conflict (client_uuid) do nothing
       returning id`,
      [auth.session.tenantId, tech.id, kind, b.from_date ?? null, b.to_date ?? b.from_date ?? null,
       reason, b.client_uuid ?? null, b.device_time ?? null]);
    if (rows[0]) return rows[0].id as string;
    // already synced — return the one that exists rather than an error
    const { rows: dup } = await c.query(
      `select id from hr_requests where tenant_id=$1 and client_uuid=$2::uuid`,
      [auth.session.tenantId, b.client_uuid ?? null]);
    return (dup[0]?.id as string) ?? null;
  });

  return NextResponse.json({ ok: true, id }, { headers: cors });
}
