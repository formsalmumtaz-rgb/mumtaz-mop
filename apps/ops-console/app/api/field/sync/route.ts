import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantId } from "@/lib/tenant";

// Field-app pre-sync: returns the technician's scheduled jobs + the details they
// need offline (customer, site, GPS, access notes, service type). Runs server-side
// (bypasses RLS) — auth/tenant-from-session arrives with the console's auth (DEBT D6).
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
            st.name as service_type,
            b.access_notes
       from jobs j
       join customers c on c.id = j.customer_id
       left join customer_branches b on b.id = j.branch_id
       left join service_types st on st.id = j.service_type_id
      where j.tenant_id = $1 and j.status = 'scheduled'
      order by j.scheduled_date
      limit 200`,
    [tenantId],
  );
  // recipe: null until treatment recipes are seeded; the frozen snapshot lives on
  // the job and will be surfaced here once recipes exist.
  const jobs = rows.map((r) => ({ ...r, recipe: null }));
  return NextResponse.json({ jobs }, { headers: cors });
}
