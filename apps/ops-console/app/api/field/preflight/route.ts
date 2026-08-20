import { NextResponse } from "next/server";
import { resolveFieldRequest, fieldCors, technicianForUser, fieldUserHasPermission } from "@/lib/field-auth";
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

  // Defect sweep item 1 — everything the pre-flight screen needs, served here so
  // the lead never types what the system knows: the team roster (attendance),
  // the vehicle list, and the ISSUED van stock to compare declarations against.
  const { scopedRead } = await import("@/lib/rls");
  const t = auth.session.tenantId;
  const [teamMembers, vehicles, issued, yesterday] = tech
    ? await Promise.all([
        scopedRead(t,
          `select t2.id, coalesce(t2.full_name, t2.code, 'Technician') as name, t2.code
             from technicians t1
             join team_assignments ta1 on ta1.technician_id = t1.id and ta1.effective_to is null
             join team_assignments ta2 on ta2.team_id = ta1.team_id and ta2.effective_to is null
             join technicians t2 on t2.id = ta2.technician_id and coalesce(t2.is_active, true)
            where t1.tenant_id = $1 and t1.id = $2
            order by t2.is_team_lead desc, name`, [t, tech.id]).then((r) => r.rows),
        scopedRead(t,
          `select id, coalesce(nullif(code,''), 'Vehicle') as label
             from vehicles where tenant_id = $1 and coalesce(is_active, true) order by label`, [t]).then((r) => r.rows),
        // The list to COUNT is everything that could plausibly be on the van:
        // what the warehouse shows issued to it, UNION what was declared on it
        // last time. Warehouse-only was wrong — a chemical carried for weeks with
        // no batch record (an adjuvant decanted from a drum, say) simply had no
        // row to write a count into, so it could never be declared and never
        // reconciled. The technician must be able to count what they can see.
        scopedRead(t,
          `with issued as (
             select oh.item_id, sum(oh.qty_base)::float8 as qty
               from batch_stock_on_hand oh
              where oh.tenant_id = $1 and oh.location_id = fn_technician_van($1, $2)
              group by oh.item_id having sum(oh.qty_base) > 0
           ), declared_before as (
             select d.item_id
               from preflight_stock_declarations d
               join preflight_checks pc on pc.id = d.preflight_check_id
              where d.tenant_id = $1 and pc.technician_id = $2
              group by d.item_id
           )
           select it.id as item_id, it.name, u.code as unit,
                  coalesce(i.qty, 0)::float8 as issued_qty,
                  (i.item_id is null) as warehouse_shows_none
             from (select item_id from issued union select item_id from declared_before) all_items
             join items it on it.id = all_items.item_id
             left join issued i on i.item_id = all_items.item_id
             left join units u on u.id = it.base_unit_id
            order by it.name`,
          [t, tech.id]).then((r) => r.rows).catch(() => []),
        // Yesterday's declared stock — today's starting point (item 2 preload)
        scopedRead(t,
          `select d.item_id, d.declared_qty_base::float8 as qty
             from preflight_stock_declarations d
             join preflight_checks pc on pc.id = d.preflight_check_id
            where d.tenant_id = $1 and pc.technician_id = $2
              and pc.check_date = (select max(check_date) from preflight_checks
                                    where tenant_id = $1 and technician_id = $2 and check_date < current_date)`,
          [t, tech.id]).then((r) => r.rows).catch(() => []),
      ])
    : [[], [], [], []];

  return NextResponse.json({
    checklist, today, hasTechnician: !!tech,
    is_team_lead: !!tech?.is_team_lead,
    team_members: teamMembers, vehicles, issued_stock: issued,
    yesterday_declared: yesterday,
  }, { headers: cors });
}

export async function POST(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  if (auth.revoked) return NextResponse.json({ error: "revoked" }, { status: 401, headers: { ...cors, "x-mop-revoked": "1" } });
  const tech = await technicianForUser(auth.session);
  if (!tech) return NextResponse.json({ error: "no technician linked to this login" }, { status: 403, headers: cors });

  // DOCUMENT 9 §A: only a TEAM LEAD (or a role holding preflight.submit) submits
  // the pre-flight — a technician never marks their own. Enforced here (API) and
  // by the preflight_checks_authority trigger (database, mig 066).
  if (!tech.is_team_lead && !(await fieldUserHasPermission(auth.session, "preflight.submit"))) {
    return NextResponse.json(
      { error: "only the team lead submits the pre-flight" },
      { status: 403, headers: cors },
    );
  }

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
    attendance: (b.attendance as Record<string, { present: boolean; uniform_ok: boolean; hygiene_ok: boolean }>) ?? {},
    // §3.8 bands. The old list here was [0,25,50,75,100] — four quarters — while
    // the column now accepts the eight bands actually specified (mig 117). The API
    // was silently discarding a technician's real reading and storing null.
    fuel_band: b.fuel_band != null && [0, 10, 20, 40, 60, 80, 99, 100].includes(Number(b.fuel_band))
      ? Number(b.fuel_band) : null,
    notes: (b.notes as string) ?? null,
    client_uuid: (b.client_uuid as string) ?? null,
    device_time: (b.device_time as string) ?? null,
    time_suspect: suspect(b.device_time as string | null),
    stock: Array.isArray(b.stock)
      ? (b.stock as { item_id?: string; qty_base?: number; note?: string }[])
          .filter((s) => s && typeof s.item_id === "string" && Number.isFinite(Number(s.qty_base)))
          .map((s) => ({ item_id: s.item_id!, qty_base: Number(s.qty_base), note: s.note ?? null }))
      : undefined,
  });
  return NextResponse.json({ ok: true }, { headers: cors });
}
