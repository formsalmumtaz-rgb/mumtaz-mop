import pg from "pg";
import { ingestDeviceEvents, drainOnce, consumers } from "@mop/worker";
const url = new URL(process.env.DATABASE_URL!); url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 4 });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
const T = "8fb05e65-0c81-45d2-bbc8-f03927150133"; // MOP Test Tenant (D-PROOF1)
const uuid = () => crypto.randomUUID();
const line = (s = "") => console.log(s);
const head = (s: string) => { line(); line("── " + s + " " + "─".repeat(Math.max(0, 60 - s.length))); };

const sl   = (await q(`select id from service_lines where tenant_id=$1 and code='pest_control'`, [T]))[0].id;
// A technician of this proof's own, so the day's arithmetic is not muddied by
// material other fixtures recorded today — job_material_usage is append-only,
// so an earlier run's rows cannot be cleared out from under this one.
const tech = (await q(`select id, coalesce(full_name,code) as name from technicians where tenant_id=$1 and code='CLOSE1'`, [T]))[0]
  ?? (await q(`insert into technicians (tenant_id, service_line_id, code, full_name, is_team_lead, is_active)
               values ($1,$2,'CLOSE1','Close Proof Lead',true,true)
               returning id, full_name as name`, [T, sl]))[0];
// the confirmation names a person — the constraint refuses a confirmed day without one
const actorId = (await q(`select id from app_users where tenant_id=$1 and email='closeday.proof@mumtaz-mop.test'`, [T]))[0]?.id
  ?? (await q(`insert into app_users (id, tenant_id, full_name, email, technician_id, is_active)
               values (gen_random_uuid(),$1,'Close Proof Lead','closeday.proof@mumtaz-mop.test',$2,true)
               returning id`, [T, tech.id]))[0].id;
await q(`update technicians set user_id = $2 where id = $1`, [tech.id, actorId]);
// their own van, stocked, so the FEFO path has somewhere to take chemical from
const van = (await q(`select id from stock_locations where tenant_id=$1 and location_type='van' and technician_id=$2`, [T, tech.id]))[0]?.id
  ?? (await q(`insert into stock_locations (tenant_id, service_line_id, name, location_type, technician_id, is_active)
               values ($1,$2,'Close Proof Van','van',$3,true) returning id`, [T, sl, tech.id]))[0].id;
const cust = (await q(`select id from customers where tenant_id=$1 limit 1`, [T]))[0];
const cat  = (await q(`select id from service_categories where tenant_id=$1 and code='com_rest_b'`, [T]))[0];
const veh  = (await q(`select id from vehicles where tenant_id=$1 limit 1`, [T]))[0];
const blitz = (await q(`select id from items where tenant_id=$1 and code='PRF-BLITZ'`, [T]))[0].id;
const surf  = (await q(`select id from items where tenant_id=$1 and code='PRF-SURF'`, [T]))[0].id;

line(`  van: ${van}`);

head("THE MORNING — the van is counted out");
// a clean slate for today so the arithmetic is readable
// Delete the parent and let the FK cascade take the counts with it. A DIRECT
// delete of a signed count is refused (mig 135) — as this script proves below;
// mop_app holds no DELETE grant on postflight_checks at all, so nothing in the
// app can take this path.
await q(`delete from postflight_checks where tenant_id=$1 and technician_id=$2 and check_date=current_date`, [T, tech.id]);
await q(`delete from preflight_stock_declarations where preflight_check_id in
          (select id from preflight_checks where tenant_id=$1 and technician_id=$2 and check_date=current_date)`, [T, tech.id]);
await q(`delete from preflight_checks where tenant_id=$1 and technician_id=$2 and check_date=current_date`, [T, tech.id]);

const pc = (await q(
  `insert into preflight_checks (tenant_id, service_line_id, technician_id, check_date, present,
     vehicle_id, odometer_km, fuel_band, ppe, equipment)
   values ($1,$2,$3,current_date,true,$4,41200,80,
     '{"gloves":true,"mask":true}'::jsonb,
     '{"sprayer":true,"torch":true,"ladder":true}'::jsonb) returning id`, [T, sl, tech.id, veh.id]))[0].id;
// Equipment COUNTED out of the yard (mig 136) — three sprayers, not "sprayer: true".
for (const [code, n] of [["sprayer", 3], ["torch", 2], ["ladder", 1]] as const) {
  await q(`insert into preflight_equipment_counts (tenant_id, preflight_check_id, equipment_code, qty_out)
           values ($1,$2,$3,$4) on conflict (preflight_check_id, equipment_code)
             do update set qty_out = excluded.qty_out`, [T, pc, code, n]);
}
for (const [item, qty] of [[blitz, 800], [surf, 250]] as const) {
  await q(`insert into preflight_stock_declarations (tenant_id, preflight_check_id, item_id, declared_qty_base)
           values ($1,$2,$3,$4)`, [T, pc, item, qty]);
}
line(`  odometer out 41200 · fuel 80%`);
line(`  counted out of the yard: 3 sprayers, 2 torches, 1 ladder`);
line(`  counted onto the van: Blitz 800 ml, Pro Surfactant 250 ml`);

head("THE DAY — one job, materials recorded, cash taken");
const job = (await q(`insert into jobs (tenant_id, service_line_id, customer_id, scheduled_date, status, service_category_id)
   values ($1,$2,$3,current_date,'in_progress',$4) returning id`, [T, sl, cust.id, cat.id]))[0].id;
await q(`insert into job_assignments (tenant_id, job_id, technician_id) values ($1,$2,$3)`, [T, job, tech.id]);
await ingestDeviceEvents(pool, T, [{
  client_uuid: uuid(), event_type: "job.materials_recorded", job_id: job, device_time: new Date().toISOString(),
  payload: { job_id: job, device_time: new Date().toISOString(), lines: [
    { client_uuid: uuid(), item_id: blitz, expected_qty: 100, actual_qty: 100, mixes: 2, water_litres: 20 },
    { client_uuid: uuid(), item_id: surf,  expected_qty: 10,  actual_qty: 10 },
  ], equipment: [{ client_uuid: uuid(), equipment_code: "sprayer" }] },
}] as never, { actorId });
await drainOnce(pool, consumers, { tenantId: T });
await q(`update jobs set status='completed', completed_at=now() where id=$1`, [job]);
line(`  1 job completed · 100 ml Blitz + 10 ml Pro Surfactant recorded`);

head("CLOSING — what the screen is served");
const equip = await q(
  `select ci.code, ci.label, coalesce(pre.qty_out, 0) as went_out
     from preflight_checklist_items ci
     left join (
       select e.equipment_code, e.qty_out from preflight_equipment_counts e
         join preflight_checks pc on pc.id = e.preflight_check_id
        where e.tenant_id = $1 and pc.technician_id = $2 and pc.check_date = current_date
     ) pre on pre.equipment_code = ci.code
    where ci.tenant_id = $1 and ci.kind = 'equipment' and ci.is_active
    order by ci.sort_order, ci.label`, [T, tech.id]);
line(`  EQUIPMENT CHECK — against the morning COUNT, not a tick`);
for (const e of equip) line(`    ${String(e.went_out).padStart(2)} out   ${e.label}`);

// the closing record, then the count
const po = (await q(
  `insert into postflight_checks (tenant_id, service_line_id, technician_id, check_date, vehicle_id,
     odometer_km, fuel_band, equipment, incidents)
   values ($1,$2,$3,current_date,$4,41338,40,'{"sprayer":true,"torch":true,"ladder":false}'::jsonb,
           'Ladder left at the second site — collecting it tomorrow morning')
   returning id`, [T, sl, tech.id, veh.id]))[0].id;
// counted back: one sprayer stayed on a site, the rest returned
for (const [code, n] of [["sprayer", 2], ["torch", 2], ["ladder", 1]] as const) {
  await q(`insert into postflight_equipment_counts (tenant_id, postflight_check_id, equipment_code, qty_back)
           values ($1,$2,$3,$4) on conflict (postflight_check_id, equipment_code)
             do update set qty_back = excluded.qty_back`, [T, po, code, n]);
}
line(`\n  counted back: 2 sprayers, 2 torches, 1 ladder`);
console.table(await q(
  `select label, went_out, came_back, difference
     from technician_day_equipment_reconciliation
    where tenant_id=$1 and technician_id=$2 and check_date=current_date and (went_out > 0 or came_back is not null)
    order by label`, [T, tech.id]));
line(`  A tick could not have said this: "sprayer: true" out and "sprayer: true" back reconciles perfectly.`);
line(`  The count says one sprayer is missing. Recorded; the close is not blocked.`);

const beforeCount = await q(
  `select product, unit, opened_with::float8, recorded_used::float8, should_have_left::float8, counted_back
     from technician_day_stock_reconciliation
    where tenant_id=$1 and technician_id=$2 and check_date=current_date order by product`, [T, tech.id]);
line(`\n  CHEMICAL CHECK — what the technician is shown before counting:`);
for (const r of beforeCount)
  line(`    ${r.product}: started ${r.opened_with} ${r.unit} · used ${r.recorded_used} · should be ${r.should_have_left} ${r.unit}`);

// they count: Blitz adds up, surfactant is 15 ml short
for (const [item, qty] of [[blitz, 700], [surf, 225]] as const) {
  await q(`insert into postflight_stock_declarations (tenant_id, postflight_check_id, item_id, returned_qty_base)
           values ($1,$2,$3,$4) on conflict (postflight_check_id, item_id) do update
             set returned_qty_base = excluded.returned_qty_base`, [T, po, item, qty]);
}
line(`\n  counted back: Blitz 700 ml, Pro Surfactant 225 ml`);
console.table(await q(
  `select product, unit, opened_with::float8 as opened, recorded_used::float8 as used,
          should_have_left::float8 as should_be, counted_back::float8 as counted, unexplained::float8
     from technician_day_stock_reconciliation
    where tenant_id=$1 and technician_id=$2 and check_date=current_date order by product`, [T, tech.id]));
line(`  Blitz adds up. 15 ml of surfactant left the van without a job — visible, not hidden.`);

head("TODAY'S SUMMARY — counted, never retyped");
await q(`insert into technician_day (tenant_id, technician_id, work_date, present, time_in)
         values ($1,$2,current_date,true, now() - interval '8 hours')
         on conflict (tenant_id, technician_id, work_date) do update set time_in = excluded.time_in, time_out = null`,
  [T, tech.id]);
const sum = (await q(
  `select
     (select count(*) from jobs j join job_assignments ja on ja.job_id=j.id
       where j.tenant_id=$1 and ja.technician_id=$2 and coalesce(j.operating_date,j.scheduled_date)=current_date)::int as assigned,
     (select count(*) from jobs j join job_assignments ja on ja.job_id=j.id
       where j.tenant_id=$1 and ja.technician_id=$2 and coalesce(j.operating_date,j.scheduled_date)=current_date
         and j.status='completed')::int as completed,
     (select to_char(d.time_in,'HH24:MI') from technician_day d
       where d.tenant_id=$1 and d.technician_id=$2 and d.work_date=current_date) as time_in,
     (select round(extract(epoch from (now()-d.time_in))/3600.0,1)::float8 from technician_day d
       where d.tenant_id=$1 and d.technician_id=$2 and d.work_date=current_date and d.time_out is null) as hours_so_far,
     (select coalesce(sum(m.actual_qty),0)::float8 from job_material_usage m
        join job_assignments ja on ja.job_id=m.job_id and ja.technician_id=$2
       where m.tenant_id=$1 and m.created_at::date=current_date) as chemical_used`, [T, tech.id]))[0];
line(`  ${sum.completed} of ${sum.assigned} jobs completed · on shift since ${sum.time_in} (${sum.hours_so_far} h) · ${sum.chemical_used} ml chemical used`);

head("CONFIRMATION AND SIGN OUT");
const STATEMENT = "I confirm the equipment and chemicals are checked back in, and the jobs, hours and figures recorded today are true and complete to the best of my knowledge.";
await q(`update postflight_checks set accountability_confirmed = true, accountability_statement = $2,
           confirmed_by = $3, confirmed_at = now() where id = $1`, [po, STATEMENT, actorId]);
await q(`update technician_day set time_out = now() where tenant_id=$1 and technician_id=$2 and work_date=current_date`, [T, tech.id]);
const closed = (await q(
  `select p.accountability_confirmed, p.confirmed_at is not null as stamped, p.accountability_statement,
          to_char(d.time_out,'HH24:MI') as signed_out, w.hours::text as hours
     from postflight_checks p
     left join technician_day d on d.tenant_id=p.tenant_id and d.technician_id=p.technician_id and d.work_date=p.check_date
     left join technician_working_hours w on w.technician_id=p.technician_id and w.check_date=p.check_date
    where p.id=$1`, [po]))[0];
line(`  confirmed: ${closed.accountability_confirmed} · stamped: ${closed.stamped}`);
line(`  signed out at ${closed.signed_out} · hours worked ${closed.hours ?? "—"}`);
line(`  wording stored with it: "${(closed.accountability_statement as string).slice(0, 62)}…"`);

head("A CONFIRMED DAY IS FROZEN (mig 135)");
for (const [what, sql, args] of [
  ["odometer",        `update postflight_checks set odometer_km = 1 where id = $1`, [po]],
  ["fuel band",       `update postflight_checks set fuel_band = 100 where id = $1`, [po]],
  ["equipment ticks", `update postflight_checks set equipment = '{"ladder":true}'::jsonb where id = $1`, [po]],
  ["the wording",     `update postflight_checks set accountability_statement = 'something else' where id = $1`, [po]],
  ["the chemical count", `update postflight_stock_declarations set returned_qty_base = 0
                            where postflight_check_id = $1`, [po]],
  ["deleting a count",   `delete from postflight_stock_declarations where postflight_check_id = $1`, [po]],
  ["the equipment count", `update postflight_equipment_counts set qty_back = 0 where postflight_check_id = $1`, [po]],
] as const) {
  try { await q(sql, args as unknown[]); line(`  ${what}: CHANGED — INVARIANT BROKEN`); }
  catch (e) { line(`  ${what}: refused — ${(e as Error).message.split(".")[0]}.`); }
}
// and the office can still see it, unchanged
const after = (await q(`select odometer_km, fuel_band, accountability_confirmed from postflight_checks where id=$1`, [po]))[0];
line(`  the record still reads: odometer ${after.odometer_km}, fuel ${after.fuel_band}%, confirmed ${after.accountability_confirmed}`);

head("CLEANUP");
await q(`delete from jobs where id=$1 and not exists (select 1 from job_material_usage where job_id=$1)`, [job]);
line(`  test-tenant fixture left in place. Live tenant untouched: 0 writes.`);
await pool.end();
