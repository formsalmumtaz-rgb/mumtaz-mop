import { NextResponse } from "next/server";
import { withRequest } from "@/lib/rls";
import { resolveFieldRequest, fieldCors } from "@/lib/field-auth";

// Vision P5.C — "Sign in for today". POST confirms the signed-in technician's
// team for the day (their OPEN assignment — operations assigns, the technician
// only confirms; the confirmation is the attendance record). Idempotent per
// technician+day (unique constraint; conflict = already confirmed).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const METHODS = "POST,OPTIONS";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: fieldCors(req, METHODS) });
}

export async function POST(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  if (auth.revoked) return NextResponse.json({ error: "revoked" }, { status: 401, headers: { ...cors, "x-mop-revoked": "1" } });
  const session = auth.session;
  const body = (await req.json().catch(() => ({}))) as { device_time?: string };

  const result = await withRequest({ tenantId: session.tenantId, actorId: session.userId }, async (c) => {
    const { rows: tech } = await c.query(
      `select t.id, ta.team_id, tm.name as team_name
         from technicians t
         left join team_assignments ta on ta.technician_id = t.id and ta.effective_to is null
         left join teams tm on tm.id = ta.team_id
        where t.tenant_id = $1 and t.user_id = $2 limit 1`,
      [session.tenantId, session.userId]);
    if (!tech[0]) return { status: 403 as const, error: "no technician linked to this login" };
    const { rows } = await c.query(
      `insert into shift_confirmations (tenant_id, technician_id, team_id, shift_date, device_time)
       values ($1, $2, $3, current_date, $4)
       on conflict (tenant_id, technician_id, shift_date) do nothing
       returning id`,
      [session.tenantId, tech[0].id, tech[0].team_id, body.device_time ?? null]);
    return { status: 200 as const, confirmed: true, already: rows.length === 0, team: tech[0].team_name as string | null };
  });

  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status, headers: cors });
  return NextResponse.json(result, { headers: cors });
}
