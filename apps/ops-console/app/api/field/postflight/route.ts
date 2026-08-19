import { NextResponse } from "next/server";
import { resolveFieldRequest, fieldCors, technicianForUser, fieldUserHasPermission } from "@/lib/field-auth";
import { withRequest } from "@/lib/rls";

// §3.7 — the supervisor closes the day: van back, stock returned, anything that
// went wrong, and the accountability confirmation.
//
// The exact wording confirmed is stored WITH the confirmation. The app sends the
// sentence the person actually read, so a year later it is provable what they put
// their name to even if the app's wording has changed since.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const METHODS = "GET,POST,OPTIONS";
const BANDS = [0, 10, 20, 40, 60, 80, 99, 100];

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: fieldCors(req, METHODS) });
}

export async function GET(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  const tech = await technicianForUser(auth.session);
  if (!tech) return NextResponse.json({ error: "no technician linked to this login" }, { status: 403, headers: cors });
  const rows = await withRequest({ tenantId: auth.session.tenantId }, (c) => c.query(
    `select p.check_date::text, p.odometer_km, p.fuel_band, p.incidents,
            p.accountability_confirmed, p.confirmed_at,
            (select pc.odometer_km from preflight_checks pc
              where pc.tenant_id = p.tenant_id and pc.technician_id = p.technician_id
                and pc.check_date = p.check_date) as odo_out
       from postflight_checks p
      where p.tenant_id = $1 and p.technician_id = $2 and p.check_date = current_date`,
    [auth.session.tenantId, tech.id])).then((r) => r.rows[0] ?? null);
  return NextResponse.json({ today: rows, is_team_lead: tech.is_team_lead }, { headers: cors });
}

export async function POST(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  if (auth.revoked) return NextResponse.json({ error: "revoked" }, { status: 401, headers: { ...cors, "x-mop-revoked": "1" } });
  const tech = await technicianForUser(auth.session);
  if (!tech) return NextResponse.json({ error: "no technician linked to this login" }, { status: 403, headers: cors });
  if (!tech.is_team_lead && !(await fieldUserHasPermission(auth.session, "preflight.submit"))) {
    return NextResponse.json({ error: "only the supervisor closes the day" }, { status: 403, headers: cors });
  }

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const confirmed = b.accountability_confirmed === true;
  const statement = String(b.accountability_statement ?? "").trim();
  if (confirmed && !statement) {
    return NextResponse.json({ error: "the confirmation must carry the wording that was agreed to" }, { status: 400, headers: cors });
  }

  await withRequest({ tenantId: auth.session.tenantId, actorId: auth.session.userId }, (c) => c.query(
    `insert into postflight_checks
       (tenant_id, service_line_id, technician_id, check_date, vehicle_id, odometer_km, fuel_band,
        equipment, stock_returned, incidents, accountability_confirmed, accountability_statement,
        confirmed_by, confirmed_at, client_uuid, device_time, created_by)
     values ($1,$2,$3,coalesce($4::date,current_date),$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,
             case when $11 then $13::uuid end, case when $11 then now() end, $14::uuid, $15, $13::uuid)
     on conflict (tenant_id, technician_id, check_date) do update set
       vehicle_id = coalesce(excluded.vehicle_id, postflight_checks.vehicle_id),
       odometer_km = coalesce(excluded.odometer_km, postflight_checks.odometer_km),
       fuel_band = coalesce(excluded.fuel_band, postflight_checks.fuel_band),
       equipment = coalesce(excluded.equipment, postflight_checks.equipment),
       stock_returned = coalesce(excluded.stock_returned, postflight_checks.stock_returned),
       incidents = coalesce(excluded.incidents, postflight_checks.incidents),
       -- a confirmation, once given, is not withdrawn by a later save
       accountability_confirmed = postflight_checks.accountability_confirmed or excluded.accountability_confirmed,
       accountability_statement = coalesce(postflight_checks.accountability_statement, excluded.accountability_statement),
       confirmed_by = coalesce(postflight_checks.confirmed_by, excluded.confirmed_by),
       confirmed_at = coalesce(postflight_checks.confirmed_at, excluded.confirmed_at),
       updated_at = now(), updated_by = excluded.created_by`,
    [auth.session.tenantId, tech.service_line_id, tech.id, (b.check_date as string) ?? null,
     (b.vehicle_id as string) ?? null,
     b.odometer_km != null ? Number(b.odometer_km) : null,
     b.fuel_band != null && BANDS.includes(Number(b.fuel_band)) ? Number(b.fuel_band) : null,
     JSON.stringify(b.equipment ?? {}), JSON.stringify(b.stock_returned ?? {}),
     (b.incidents as string) ?? null, confirmed, statement || null,
     auth.session.userId, (b.client_uuid as string) ?? null, (b.device_time as string) ?? null]));

  return NextResponse.json({ ok: true }, { headers: cors });
}
