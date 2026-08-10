import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantId } from "@/lib/tenant";

// Field-app pre-sync: returns the technician's ACTIVE jobs (scheduled + assigned +
// in-flight) with the details they need offline (customer, site, GPS, start time,
// duration, service line/type, instructions, assigned crew, access notes). Runs
// server-side (bypasses RLS) — per-technician scoping + auth/tenant-from-session
// arrives with the console's auth (DEBT D6). Including 'assigned' is essential:
// once the scheduler assigns a job it leaves 'scheduled', and must still sync.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}

export async function GET() {
  const tenantId = await getTenantId();
  const { rows } = await pool.query(
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
            (select string_agg(coalesce(t.full_name, t.code), ', ')
               from job_assignments ja join technicians t on t.id = ja.technician_id
              where ja.job_id = j.id) as assigned_technicians
       from jobs j
       join customers c on c.id = j.customer_id
       left join customer_branches b on b.id = j.branch_id
       left join service_lines sl on sl.id = j.service_line_id
       left join service_types st on st.id = j.service_type_id
      where j.tenant_id = $1
        and j.status in ('scheduled','assigned','en_route','arrived','in_progress')
      order by j.scheduled_date, j.scheduled_start nulls last
      limit 500`,
    [tenantId],
  );
  // recipe: null until treatment recipes are seeded; the frozen snapshot lives on
  // the job and will be surfaced here once recipes exist.
  const jobs = rows.map((r) => ({ ...r, recipe: null }));
  return NextResponse.json({ jobs }, { headers: cors });
}
