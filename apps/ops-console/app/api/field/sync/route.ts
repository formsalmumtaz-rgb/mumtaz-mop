import { NextResponse } from "next/server";
import { scopedRead } from "@/lib/rls";
import { resolveFieldRequest, fieldCors } from "@/lib/field-auth";

// Field-app pre-sync: returns the AUTHENTICATED technician's own ACTIVE jobs
// (scheduled + assigned + in-flight) with the details they need offline (customer,
// site, GPS, start time, duration, service line/type, instructions, assigned crew,
// access notes). Including 'assigned' is essential: once the scheduler assigns a
// job it leaves 'scheduled' and must still sync.
//
// Security (previously a tenant-wide anonymous read):
//  - requires a Supabase session (401 otherwise);
//  - scoped to jobs assigned to a technician the session user operates as
//    (technicians.user_id) — a user with no linked technician sees nothing;
//  - runs through scopedRead, so it executes as the non-privileged mop_app role
//    with RLS live (no more privileged pool bypass);
//  - no wildcard CORS (see fieldCors).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const METHODS = "GET,OPTIONS";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: fieldCors(req, METHODS) });
}

export async function GET(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  }
  // A revoked login gets no fresh work — the device is locking out (T1).
  if (auth.revoked) {
    return NextResponse.json({ error: "revoked" }, { status: 401, headers: { ...cors, "x-mop-revoked": "1" } });
  }
  const session = auth.session;

  const { rows } = await scopedRead(
    session.tenantId,
    `select j.id,
            c.trade_name as customer_name,
            b.name as branch_name,
            b.address,
            ST_Y(coalesce(j.location, b.location)::geometry) as lat,
            ST_X(coalesce(j.location, b.location)::geometry) as lng,
            j.scheduled_date::text as scheduled_date,
            to_char(j.scheduled_start,'HH24:MI') as scheduled_start,
            j.est_duration_minutes,
            sl.name as service_line,
            st.name as service_type,
            j.status,
            j.attributes->>'instructions' as instructions,
            b.access_notes,
            -- Item 18: the completion checklist derives from the SERVICE, not a
            -- constant — a cleaning job never asks "Treatment applied".
            -- "Bait stations checked" is deliberately absent until sites record
            -- bait stations (monitoring-points module) — a site without them
            -- must never be asked about them.
            case when sl.code = 'cleaning' then
              jsonb_build_array('Site accessible','Area cleaned','Customer briefed')
            when sl.code = 'facilities_management' then
              jsonb_build_array('Site accessible','Work completed','Customer briefed')
            else
              jsonb_build_array('Site accessible','Treatment applied','Customer briefed')
            end as checklist_items,
            (select string_agg(coalesce(t.full_name, t.code), ', ')
               from job_assignments ja join technicians t on t.id = ja.technician_id
              where ja.job_id = j.id) as assigned_technicians,
            -- Frozen treatment recipe on the job (jobs.recipe_version_id, mig 012).
            -- Null when the job has no recipe attached; the field app then allows
            -- manual chemical entry (T4).
            case when rv.id is not null then
              jsonb_build_object(
                'name', tr.name,
                'dose_rate', rv.dose_rate, 'dose_unit', du.code,
                'dilution_ratio', rv.dilution_ratio,
                'coverage_per_unit', rv.coverage_per_unit, 'coverage_unit', cu.code,
                'notes', rv.notes, 'is_assumed', rv.is_assumed
              ) end as recipe
       from jobs j
       join customers c on c.id = j.customer_id
       left join customer_branches b on b.id = j.branch_id
       left join service_lines sl on sl.id = j.service_line_id
       left join service_types st on st.id = j.service_type_id
       left join treatment_recipe_versions rv on rv.id = j.recipe_version_id
       left join treatment_recipes tr on tr.id = rv.recipe_id
       left join units du on du.id = rv.dose_unit_id
       left join units cu on cu.id = rv.coverage_unit_id
      where j.tenant_id = $1
        and j.status in ('scheduled','assigned','en_route','arrived','in_progress')
        and exists (
          select 1 from job_assignments ja
          join technicians t on t.id = ja.technician_id
          where ja.job_id = j.id and t.tenant_id = j.tenant_id and t.user_id = $2
        )
      order by j.scheduled_date, j.scheduled_start nulls last
      limit 500`,
    [session.tenantId, session.userId],
  );
  // recipe is the frozen treatment recipe on the job (or null) — built in SQL above.
  // inspection_options drive the button-driven post-inspection form (T4).
  const { rows: inspectionOptions } = await scopedRead(
    session.tenantId,
    `select kind, code, label from inspection_options where tenant_id = $1 and is_active order by kind, sort_order`,
    [session.tenantId],
  );
  // Vision P3: the technician's IN-HAND VAN STOCK — always visible on device,
  // decremented optimistically as usage is recorded. The van is the team's van
  // location ("<team name> Van", seeded 065); no team pin → empty list (honest).
  const { rows: vanStock } = await scopedRead(
    session.tenantId,
    `select it.name as item, u_base.code as unit, sum(oh.qty_base)::float8 as qty
       from technicians t
       join team_assignments ta on ta.technician_id = t.id and ta.effective_to is null
       join teams tm on tm.id = ta.team_id
       join stock_locations sl on sl.tenant_id = t.tenant_id and sl.name = tm.name || ' Van'
       join batch_stock_on_hand oh on oh.location_id = sl.id and oh.tenant_id = t.tenant_id
       join items it on it.id = oh.item_id
       left join units u_base on u_base.id = it.base_unit_id
      where t.tenant_id = $1 and t.user_id = $2
      group by it.name, u_base.code
     having sum(oh.qty_base) > 0
      order by it.name`,
    [session.tenantId, session.userId],
  ).catch(() => ({ rows: [] as { item: string; unit: string | null; qty: number }[] }));
  // Vision P5.C — who am I today: current team (operations-assigned) + whether
  // today's attendance confirmation exists yet, and team-lead status.
  const { rows: me } = await scopedRead(
    session.tenantId,
    `select t.id, coalesce(t.full_name, t.code) as name, t.is_team_lead,
            tm.name as team_name,
            exists (select 1 from shift_confirmations sc
                     where sc.technician_id = t.id and sc.shift_date = current_date) as confirmed_today
       from technicians t
       left join team_assignments ta on ta.technician_id = t.id and ta.effective_to is null
       left join teams tm on tm.id = ta.team_id
      where t.tenant_id = $1 and t.user_id = $2 limit 1`,
    [session.tenantId, session.userId],
  );
  // Item 3A: office staff for the technician's "approved by" picker.
  const { rows: staff } = await scopedRead(
    session.tenantId,
    `select id, coalesce(full_name, email, 'Staff') as name
       from app_users where tenant_id = $1 and is_active and technician_id is null
      order by name limit 50`,
    [session.tenantId],
  ).catch(() => ({ rows: [] as { id: string; name: string }[] }));

  return NextResponse.json({
    jobs: rows, inspection_options: inspectionOptions, van_stock: vanStock,
    me: me[0] ?? null, staff,
  }, { headers: cors });
}
