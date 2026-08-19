import { NextResponse } from "next/server";
import { resolveFieldRequest, fieldCors, technicianForUser } from "@/lib/field-auth";
import { scopedRead } from "@/lib/rls";
import { upsertTechnicianDay } from "@/lib/domain/preflight";

// §3.7 — everything the technician's own day screen shows, in one call, because
// the app must render it from cache with no signal. Their crew, today's jobs,
// their clock, their hours and their KPIs.
//
// Read-only. Nothing here decides anything; the numbers are counted from records
// that already exist, so a technician and the office are always looking at the
// same figures.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const METHODS = "GET,POST,OPTIONS";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: fieldCors(req, METHODS) });
}

export async function GET(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  if (auth.revoked) return NextResponse.json({ error: "revoked" }, { status: 401, headers: { ...cors, "x-mop-revoked": "1" } });
  const tech = await technicianForUser(auth.session);
  if (!tech) return NextResponse.json({ error: "no technician linked to this login" }, { status: 403, headers: cors });

  const t = auth.session.tenantId;
  const [day, crew, kpis, requests] = await Promise.all([
    // the clock and the checklists, as they stand right now
    // the technician's OWN day — theirs to write, unlike the lead's pre-flight
    scopedRead(t, `select d.work_date::text as check_date, d.present, d.time_in, d.time_out, d.uniform,
                          w.hours::text as hours,
                          (select pc.fuel_band from preflight_checks pc
                            where pc.tenant_id = d.tenant_id and pc.check_date = d.work_date
                            order by pc.created_at desc limit 1) as fuel_band
                     from technician_day d
                     left join technician_working_hours w
                       on w.technician_id = d.technician_id and w.check_date = d.work_date
                    where d.tenant_id = $1 and d.technician_id = $2 and d.work_date = current_date`,
      [t, tech.id]).then((r) => r.rows[0] ?? null),

    // who they are working with today — the open assignment, nothing to re-enter
    scopedRead(t, `select tm.name as team_name,
                          coalesce(array_agg(distinct t2.full_name) filter (where t2.id <> $2), '{}') as mates,
                          coalesce(array_agg(distinct v.name) filter (where v.name is not null), '{}') as vehicles
                     from team_assignments a
                     join teams tm on tm.id = a.team_id
                     left join team_assignments a2 on a2.team_id = a.team_id and a2.effective_to is null
                     left join technicians t2 on t2.id = a2.technician_id
                     left join team_vehicles tv on tv.team_id = a.team_id and tv.effective_to is null
                     left join vehicles v on v.id = tv.vehicle_id
                    where a.tenant_id = $1 and a.technician_id = $2 and a.effective_to is null
                    group by tm.name`, [t, tech.id]).then((r) => r.rows[0] ?? null),

    // the day's numbers, counted from the jobs themselves
    scopedRead(t, `select count(*)::int as assigned,
                          count(*) filter (where j.status = 'completed')::int as completed,
                          count(*) filter (where j.status = 'delayed')::int as delayed,
                          count(*) filter (where j.status = 'cancelled')::int as cancelled
                     from jobs j
                     join job_assignments ja on ja.job_id = j.id
                    where j.tenant_id = $1 and ja.technician_id = $2
                      and coalesce(j.operating_date, j.scheduled_date) = current_date
                      and j.archived_at is null`, [t, tech.id]).then((r) => r.rows[0]),

    scopedRead(t, `select id, kind, status, from_date::text, to_date::text, reason, decision_note
                     from hr_requests
                    where tenant_id = $1 and technician_id = $2
                    order by created_at desc limit 10`, [t, tech.id]).then((r) => r.rows),
  ]);

  return NextResponse.json({
    technician: { id: tech.id, is_team_lead: tech.is_team_lead },
    day, crew, kpis, requests,
  }, { headers: cors });
}

// The technician writing their own day: present, uniform, TIME IN, TIME OUT.
// No team-lead authority needed — this record is about themselves, and the
// technician id comes from the session so it can only ever be their own.
export async function POST(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  if (auth.revoked) return NextResponse.json({ error: "revoked" }, { status: 401, headers: { ...cors, "x-mop-revoked": "1" } });
  const tech = await technicianForUser(auth.session);
  if (!tech) return NextResponse.json({ error: "no technician linked to this login" }, { status: 403, headers: cors });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await upsertTechnicianDay(auth.session.tenantId, auth.session.userId, {
    technicianId: tech.id,
    work_date: (b.work_date as string) ?? null,
    present: b.present !== false,
    uniform: (b.uniform as Record<string, boolean>) ?? null,
    time_in: (b.time_in as string) ?? null,
    time_out: (b.time_out as string) ?? null,
    client_uuid: (b.client_uuid as string) ?? null,
    device_time: (b.device_time as string) ?? null,
  });
  return NextResponse.json({ ok: true, ...r }, { headers: cors });
}
