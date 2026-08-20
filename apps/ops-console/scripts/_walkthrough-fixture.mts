// Sets up a full technician DAY on MOP Test Tenant so the field app can be
// walked screen by screen in the production build.
import pg from "pg";
const url = new URL(process.env.DATABASE_URL!); url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 3 });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
const T = "8fb05e65-0c81-45d2-bbc8-f03927150133";
const EMAIL = "pilot.walkthrough@mumtaz-mop.test";

// NOTE: SUPABASE_SERVICE_ROLE_KEY is empty in .env.local, so no auth user can be
// minted here. This fixture creates the DATABASE side only (app_user, technician
// link, crew, jobs, pre-flight declaration) under a fixed placeholder id.
const authUser = { id: "00000000-0000-4000-8000-00000000dead" };
console.log(`walkthrough app_user: ${authUser.id}`);

const sl = (await q(`select id from service_lines where tenant_id=$1 and code='pest_control'`, [T]))[0].id;
const tech = (await q(`select id, code, full_name from technicians where tenant_id=$1 limit 1`, [T]))[0];
const cust = (await q(`select id, trade_name from customers where tenant_id=$1 limit 1`, [T]))[0];
const cat = (await q(`select id, name from service_categories where tenant_id=$1 and code='com_rest_b'`, [T]))[0];
const veh = (await q(`select id from vehicles where tenant_id=$1 limit 1`, [T]))[0];

// ── link it to the tenant and the technician ─────────────────────────
await q(`insert into app_users (id, tenant_id, full_name, email, technician_id, is_active)
         values ($1,$2,$3,$4,$5,true)
         on conflict (id) do update set technician_id = excluded.technician_id, is_active = true`,
  [authUser.id, T, tech.full_name, EMAIL, tech.id]);
await q(`update technicians set user_id = $1 where id = $2`, [authUser.id, tech.id]);
// operations role so the console side of the walkthrough works too
const role = (await q(`select id from roles where tenant_id=$1 and code in ('admin','operations') order by case code when 'admin' then 0 else 1 end limit 1`, [T]))[0];
if (role) await q(`insert into user_roles (tenant_id, user_id, role_id) values ($1,$2,$3) on conflict do nothing`, [T, authUser.id, role.id])
  .catch(() => {});

// ── a team + vehicle, so the crew card and the van have something to say ──
let team = (await q(`select id from teams where tenant_id=$1 and name='Pilot Team'`, [T]))[0]?.id;
if (!team) team = (await q(`insert into teams (tenant_id, service_line_id, name, is_active) values ($1,$2,'Pilot Team',true) returning id`, [T, sl]))[0].id;
await q(`insert into team_assignments (tenant_id, service_line_id, team_id, technician_id)
         select $1,$2,$3,$4 where not exists (select 1 from team_assignments where team_id=$3 and technician_id=$4 and effective_to is null)`,
  [T, sl, team, tech.id]);
await q(`insert into team_vehicles (tenant_id, team_id, vehicle_id)
         select $1,$2,$3 where not exists (select 1 from team_vehicles where team_id=$2 and vehicle_id=$3 and effective_to is null)`,
  [T, team, veh.id]).catch((e) => console.log("  team_vehicles:", e.message));

// ── today's work: three jobs, one already done ───────────────────────
await q(`delete from job_assignments where job_id in (select id from jobs where tenant_id=$1 and scheduled_date=current_date and status in ('scheduled','assigned'))`, [T]);
await q(`delete from jobs where tenant_id=$1 and scheduled_date=current_date and status in ('scheduled','assigned')`, [T]);
const times = ["09:00", "11:30", "14:00"];
for (const [i, t] of times.entries()) {
  const j = (await q(`insert into jobs (tenant_id, service_line_id, customer_id, scheduled_date, scheduled_start,
      est_duration_minutes, status, service_category_id)
    values ($1,$2,$3,current_date, (current_date + $4::time), 45, 'assigned', $5) returning id`,
    [T, sl, cust.id, t, cat.id]))[0].id;
  await q(`update jobs set service_type_id = (select id from service_types where tenant_id=$1 and code='spray_treatment') where id=$2`, [T, j]);
  await q(`insert into job_assignments (tenant_id, job_id, technician_id) values ($1,$2,$3)`, [T, j, tech.id]);
  console.log(`job ${i + 1}: ${t} ${cust.trade_name} — ${cat.name}`);
}

// ── this morning's pre-flight declaration, so the van bar has counted stock ──
const pc = (await q(`select id from preflight_checks where tenant_id=$1 and technician_id=$2 and check_date=current_date`, [T, tech.id]))[0]?.id
  ?? (await q(`insert into preflight_checks (tenant_id, service_line_id, technician_id, check_date, present, vehicle_id, fuel_band, ppe, equipment)
               values ($1,$2,$3,current_date,true,$4,80,'{"gloves":true,"mask":true,"goggles":true,"coverall":true,"boots":true}'::jsonb,
                       '{"sprayer":true,"bait_gun":true,"torch":true}'::jsonb) returning id`, [T, sl, tech.id, veh.id]))[0].id;
for (const [code, qty] of [["PRF-BLITZ", 800], ["PRF-SURF", 250], ["PRF-FEND", 500]] as const) {
  const it = (await q(`select id from items where tenant_id=$1 and code=$2`, [T, code]))[0];
  if (!it) continue;
  await q(`insert into preflight_stock_declarations (tenant_id, preflight_check_id, item_id, declared_qty_base)
           select $1,$2,$3,$4 where not exists (select 1 from preflight_stock_declarations where preflight_check_id=$2 and item_id=$3)`,
    [T, pc, it.id, qty]);
}
console.log(`pre-flight declared: Blitz 800 ml, Pro Surfactant 250 ml, Fendona 500 ml`);

console.log(`
USER=${authUser.id}`);
await pool.end();
