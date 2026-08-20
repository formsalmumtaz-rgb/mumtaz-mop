import { NextResponse } from "next/server";
import { resolveFieldRequest, fieldCors, technicianForUser, fieldUserHasPermission } from "@/lib/field-auth";
import { withRequest, scopedRead } from "@/lib/rls";
import { upsertTechnicianDay } from "@/lib/domain/preflight";

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

// The wording the supervisor is asked to put their name to. It is served BY the
// server so the app cannot quietly sign them up to something else, and the app
// sends back the sentence it actually displayed — the two are compared on save.
const CLOSING_STATEMENT =
  "I confirm the equipment and chemicals are checked back in, and the jobs, hours and figures recorded today are true and complete to the best of my knowledge.";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: fieldCors(req, METHODS) });
}

export async function GET(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  const tech = await technicianForUser(auth.session);
  if (!tech) return NextResponse.json({ error: "no technician linked to this login" }, { status: 403, headers: cors });
  const t = auth.session.tenantId;
  const [today, equipment, stock, summary] = await Promise.all([
    scopedRead(t,
      `select p.check_date::text, p.odometer_km, p.fuel_band, p.incidents, p.equipment,
              p.accountability_confirmed, p.confirmed_at,
              (select pc.odometer_km from preflight_checks pc
                where pc.tenant_id = p.tenant_id and pc.technician_id = p.technician_id
                  and pc.check_date = p.check_date) as odo_out
         from postflight_checks p
        where p.tenant_id = $1 and p.technician_id = $2 and p.check_date = current_date`,
      [t, tech.id]).then((r) => r.rows[0] ?? null),

    // The equipment vocabulary is the SAME list the morning ticked. Anything
    // ticked out this morning is what has to come back; the rest is shown too,
    // because a tool can be picked up during the day.
    scopedRead(t,
      `select ci.code, ci.label,
              coalesce((pc.equipment ->> ci.code)::boolean, false) as taken_out,
              coalesce((po.equipment ->> ci.code)::boolean, false) as already_back
         from preflight_checklist_items ci
         left join preflight_checks pc
           on pc.tenant_id = ci.tenant_id and pc.technician_id = $2 and pc.check_date = current_date
         left join postflight_checks po
           on po.tenant_id = ci.tenant_id and po.technician_id = $2 and po.check_date = current_date
        where ci.tenant_id = $1 and ci.kind = 'equipment' and ci.is_active
        order by ci.sort_order, ci.label`,
      [t, tech.id]).then((r) => r.rows),

    // The chemical check: what the van opened with, what the day recorded as
    // used, what should therefore be left, and anything already counted back.
    // The technician is shown the arithmetic — they are not asked to do it.
    scopedRead(t,
      `select r.item_id, r.product, coalesce(r.unit, '') as unit,
              r.opened_with::float8, r.recorded_used::float8,
              r.should_have_left::float8, r.counted_back::float8
         from technician_day_stock_reconciliation r
        where r.tenant_id = $1 and r.technician_id = $2 and r.check_date = current_date
        order by r.product`,
      [t, tech.id]).then((r) => r.rows).catch(() => []),

    // Today, in figures. Every one of these is COUNTED from records that already
    // exist — nobody retypes their own day (Art. VI).
    scopedRead(t,
      `select
         (select count(*) from jobs j join job_assignments ja on ja.job_id = j.id
           where j.tenant_id = $1 and ja.technician_id = $2 and j.archived_at is null
             and coalesce(j.operating_date, j.scheduled_date) = current_date)::int as jobs_assigned,
         (select count(*) from jobs j join job_assignments ja on ja.job_id = j.id
           where j.tenant_id = $1 and ja.technician_id = $2 and j.archived_at is null
             and coalesce(j.operating_date, j.scheduled_date) = current_date
             and j.status = 'completed')::int as jobs_completed,
         (select count(*) from jobs j join job_assignments ja on ja.job_id = j.id
           where j.tenant_id = $1 and ja.technician_id = $2 and j.archived_at is null
             and coalesce(j.operating_date, j.scheduled_date) = current_date
             and j.status in ('delayed','cancelled'))::int as jobs_not_done,
         (select to_char(d.time_in, 'HH24:MI') from technician_day d
           where d.tenant_id = $1 and d.technician_id = $2 and d.work_date = current_date) as time_in,
         (select round(extract(epoch from (now() - d.time_in)) / 3600.0, 1)::float8
            from technician_day d
           where d.tenant_id = $1 and d.technician_id = $2 and d.work_date = current_date
             and d.time_in is not null and d.time_out is null) as hours_so_far,
         (select to_char(d.time_out, 'HH24:MI') from technician_day d
           where d.tenant_id = $1 and d.technician_id = $2 and d.work_date = current_date) as time_out,
         (select coalesce(sum(rc.amount), 0)::float8 from receipts rc
           where rc.tenant_id = $1 and rc.receipt_date = current_date
             and rc.collected_by_technician_id = $2) as cash_collected,
         (select coalesce(sum(e.amount), 0)::float8 from expenses e
           where e.tenant_id = $1 and e.expense_date = current_date
             and e.technician_id = $2) as expenses_logged,
         (select count(distinct m.item_id)::int
            from job_material_usage m
            join job_assignments ja on ja.job_id = m.job_id and ja.technician_id = $2
           where m.tenant_id = $1 and m.created_at::date = current_date) as chemical_products_used`,
      [t, tech.id]).then((r) => r.rows[0]).catch(() => null),
  ]);

  return NextResponse.json({
    today, equipment, stock, summary,
    is_team_lead: tech.is_team_lead, statement: CLOSING_STATEMENT,
  }, { headers: cors });
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
  // The app must send back the sentence it actually put in front of the person.
  // If it sends something else, the two disagree and nobody signed anything.
  if (confirmed && statement !== CLOSING_STATEMENT) {
    return NextResponse.json(
      { error: "the confirmation wording does not match the one this server issued" },
      { status: 409, headers: cors });
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

  // ── The chemical count back onto the van ────────────────────────────
  // Written whenever it is sent, confirmed or not: a lead who counts, gets
  // called away and comes back must not have to count twice. Correctable until
  // the confirmation freezes the day (postflight_authority).
  const counts = Array.isArray(b.stock_counted) ? (b.stock_counted as Record<string, unknown>[]) : [];
  if (counts.length > 0) {
    await withRequest({ tenantId: auth.session.tenantId, actorId: auth.session.userId }, async (c) => {
      const pf = (await c.query(
        `select id from postflight_checks
          where tenant_id = $1 and technician_id = $2 and check_date = current_date`,
        [auth.session.tenantId, tech.id])).rows[0];
      if (!pf) return;
      for (const l of counts) {
        if (!l.item_id || l.qty == null || Number(l.qty) < 0) continue;
        await c.query(
          `insert into postflight_stock_declarations
             (tenant_id, postflight_check_id, item_id, returned_qty_base, note, created_by)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (postflight_check_id, item_id) do update
             set returned_qty_base = excluded.returned_qty_base, note = excluded.note`,
          [auth.session.tenantId, pf.id, l.item_id, Number(l.qty),
           (l.note as string) ?? null, auth.session.userId]);
      }
    });
  }

  // ── Sign out ────────────────────────────────────────────────────────
  // Confirming the day IS the supervisor's sign-out. Their own clock only —
  // the day-close is one person's statement, not a stamp on the whole crew.
  // The clock stays on technician_day (mig 122); it never went back onto
  // preflight_checks, where a plain technician could not write it.
  if (confirmed) {
    await upsertTechnicianDay(auth.session.tenantId, auth.session.userId, {
      technicianId: tech.id,
      work_date: (b.check_date as string) ?? null,
      present: true,
      uniform: null,
      time_in: null,
      time_out: (b.device_time as string) ?? new Date().toISOString(),
      client_uuid: (b.client_uuid as string) ?? null,
      device_time: (b.device_time as string) ?? null,
    }).catch(() => { /* the close is the primary fact; a clock already out is fine */ });
  }

  return NextResponse.json({ ok: true }, { headers: cors });
}
