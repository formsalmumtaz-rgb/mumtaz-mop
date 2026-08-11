import { NextResponse } from "next/server";
import { scopedRead } from "@/lib/rls";
import { fieldSession, fieldCors } from "@/lib/field-auth";

// Field-app pre-sync: returns the AUTHENTICATED technician's own scheduled jobs +
// the details they need offline (customer, site, GPS, access notes, service type).
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
  const session = await fieldSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  }

  const { rows } = await scopedRead(
    session.tenantId,
    `select j.id,
            c.trade_name as customer_name,
            b.name as branch_name,
            b.address,
            ST_Y(coalesce(j.location, b.location)::geometry) as lat,
            ST_X(coalesce(j.location, b.location)::geometry) as lng,
            j.scheduled_date::text as scheduled_date,
            st.name as service_type,
            b.access_notes
       from jobs j
       join customers c on c.id = j.customer_id
       left join customer_branches b on b.id = j.branch_id
       left join service_types st on st.id = j.service_type_id
      where j.tenant_id = $1
        and j.status = 'scheduled'
        and exists (
          select 1 from job_assignments ja
          join technicians t on t.id = ja.technician_id
          where ja.job_id = j.id and t.tenant_id = j.tenant_id and t.user_id = $2
        )
      order by j.scheduled_date
      limit 200`,
    [session.tenantId, session.userId],
  );
  // recipe: null until treatment recipes are seeded; the frozen snapshot lives on
  // the job and will be surfaced here once recipes exist.
  const jobs = rows.map((r) => ({ ...r, recipe: null }));
  return NextResponse.json({ jobs }, { headers: cors });
}
