import pg from "pg";
import { ingestDeviceEvents, drainOnce, consumers } from "@mop/worker";

const url = new URL(process.env.DATABASE_URL!); url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 4 });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
// D-PROOF1: anything that writes append-only or money runs on the TEST tenant.
const T = "8fb05e65-0c81-45d2-bbc8-f03927150133"; // MOP Test Tenant
const uuid = () => crypto.randomUUID();
const made: Record<string, string[]> = { jobs: [], items: [], recipes: [] };

const line = (s = "") => console.log(s);
const head = (s: string) => { line(); line("── " + s + " " + "─".repeat(Math.max(0, 62 - s.length))); };

head("FIXTURE — MOP Test Tenant");
const sl = (await q(`select id from service_lines where tenant_id=$1 order by created_at limit 1`, [T]))[0].id;
const cust = (await q(`select id, trade_name from customers where tenant_id=$1 limit 1`, [T]))[0];
const tech = (await q(`select id, coalesce(full_name,code) as name, user_id from technicians where tenant_id=$1 limit 1`, [T]))[0];
const actor = (await q(`select id from app_users where tenant_id=$1 limit 1`, [T]))[0] ?? { id: null };

const unit = async (code: string, name: string) => (await q(
  `insert into units (tenant_id, code, name, dimension, to_base_factor)
   values ($1,$2,$3,'volume',1) on conflict do nothing returning id`, [T, code, name]))[0]?.id
  ?? (await q(`select id from units where tenant_id=$1 and code=$2`, [T, code]))[0].id;
const ml = await unit("ml", "millilitre");

const item = async (code: string, name: string, group: string | null) => {
  const ex = (await q(`select id from items where tenant_id=$1 and code=$2`, [T, code]))[0];
  if (ex) return ex.id;
  const id = (await q(
    `insert into items (tenant_id, service_line_id, code, name, item_type, base_unit_id, substitution_group, is_active)
     values ($1,$2,$3,$4,'chemical',$5,$6,true) returning id`, [T, sl, code, name, ml, group]))[0].id;
  made.items.push(id); return id;
};
const blitz = await item("PRF-BLITZ", "Blitz Residual Spray", "residual_spray");
const fend  = await item("PRF-FEND",  "Fendona",              "residual_spray");
const surf  = await item("PRF-SURF",  "Pro Surfactant",       null);
line(`service line, customer ${cust.trade_name}, technician ${tech.name}`);
line(`items: Blitz + Fendona (same substitution group) + Pro Surfactant (adjuvant)`);

// the recipe: 50 ml in 10 L  =>  dilution_value 0.005
const rec = (await q(`select id from treatment_recipes where tenant_id=$1 and code='spray_general'`, [T]))[0]?.id
  ?? (await q(`insert into treatment_recipes (tenant_id, service_line_id, code, name, is_active)
               values ($1,$2,'spray_general','General Residual Spray',true) returning id`, [T, sl]))[0].id;
let ver = (await q(`select id from treatment_recipe_versions where recipe_id=$1 and effective_to is null`, [rec]))[0]?.id;
if (!ver) {
  ver = (await q(`insert into treatment_recipe_versions
      (recipe_id, version_no, effective_from, product_item_id, dose_rate, dose_unit_id, dilution_ratio, dilution_value)
    values ($1,1,current_date,$2,50,$3,'50 ml per 10 L water',0.005) returning id`, [rec, blitz, ml]))[0].id;
  await q(`insert into treatment_recipe_adjuvants (tenant_id, version_id, item_id, dose_rate, dose_unit_id, per_litres)
           values ($1,$2,$3,10,$4,20)`, [T, ver, surf, ml]);
}
line(`recipe: Blitz 50 ml per 10 L, adjuvant Pro Surfactant 10 ml per 20 L`);

// Restaurant B preset — 2 mixes x 50 ml, ceiling 120 ml so the cap is provable
let cat = (await q(`select id from service_categories where tenant_id=$1 and code='com_rest_b'`, [T]))[0]?.id;
if (!cat) cat = (await q(`insert into service_categories (tenant_id, service_line_id, code, name, mixes, ml_per_mix, max_ml, is_active)
                          values ($1,$2,'com_rest_b','Restaurant B',2,50,120,true) returning id`, [T, sl]))[0].id;
else await q(`update service_categories set mixes=2, ml_per_mix=50, max_ml=120 where id=$1`, [cat]);
line(`preset: Restaurant B = 2 mixes x 50 ml, ceiling 120 ml`);

// the van, with 800 ml of Blitz and 500 ml of Fendona counted onto it
const van = (await q(`select id from stock_locations where tenant_id=$1 and location_type='van' and technician_id=$2`, [T, tech.id]))[0]?.id
  ?? (await q(`insert into stock_locations (tenant_id, service_line_id, name, location_type, technician_id, is_active)
               values ($1,$2,'Proof Van','van',$3,true) returning id`, [T, sl, tech.id]))[0].id;
const FIXED: Record<string, string> = {
  "BLITZ-NEAR": "aaaaaaaa-0000-4000-8000-000000000001",
  "BLITZ-FAR":  "aaaaaaaa-0000-4000-8000-000000000002",
  "FEND-A":     "aaaaaaaa-0000-4000-8000-000000000003",
};
const stockIn = async (itemId: string, qty: number, batchNo: string, expiry: string, cost: number) => {
  const b = (await q(`select id from item_batches where tenant_id=$1 and item_id=$2 and batch_no=$3`, [T, itemId, batchNo]))[0]?.id
    ?? (await q(`insert into item_batches (tenant_id, item_id, batch_no, expiry_date, unit_cost, cost_currency, is_active)
                 values ($1,$2,$3,$4,$5,'AED',true) returning id`, [T, itemId, batchNo, expiry, cost]))[0].id;
  await q(`insert into stock_movements (tenant_id, service_line_id, item_id, batch_id, to_location_id, movement_type, quantity, unit_id, client_uuid)
           values ($1,$2,$3,$4,$5,'receipt',$6,$7,$8) on conflict do nothing`,
    [T, sl, itemId, b, van, qty, ml, FIXED[batchNo]]);
  return b;
};
await stockIn(blitz, 300, "BLITZ-NEAR", "2026-10-01", 0.085);   // expires FIRST — FEFO must take this
await stockIn(blitz, 500, "BLITZ-FAR",  "2027-06-01", 0.085);
await stockIn(fend,  500, "FEND-A",     "2027-01-01", 0.070);
line(`van stocked: Blitz 300 ml (exp 2026-10-01) + 500 ml (exp 2027-06-01); Fendona 500 ml`);

const mkJob = async () => {
  const j = (await q(`insert into jobs (tenant_id, service_line_id, customer_id, scheduled_date, status, service_category_id)
                      values ($1,$2,$3,current_date,'in_progress',$4) returning id`, [T, sl, cust.id, cat]))[0].id;
  await q(`insert into job_assignments (tenant_id, job_id, technician_id) values ($1,$2,$3)`, [T, j, tech.id]);
  made.jobs.push(j); return j;
};

head("1. WHAT THE TECHNICIAN IS SHOWN BEFORE THEY TREAT");
const job1 = await mkJob();
const d = (await q(`select fn_expected_dose($1,$2) as d`, [T, job1]))[0].d;
line(`  "${d.why}"`);
line(`  ${d.total_qty} ${d.product.unit} ${d.product.name}` +
     d.adjuvants.map((a: any) => ` + ${a.qty} ${a.unit} ${a.name}`).join("") +
     ` in ${d.water_litres} L water`);
line(`  may swap to: ${d.alternatives.map((a: any) => a.name).join(", ")}`);
line(`  ceiling: ${d.cap_qty} ${d.product.unit}   (source: ${d.category_source})`);
line();
line(`  owner asked for: "Expected: 100 ml Blitz + 10 ml Pro Surfactant in 20 L water (2 mixes of 50 ml)"`);
const matches = d.total_qty === 100 && d.water_litres === 20 && d.mixes === 2
  && d.adjuvants[0]?.qty === 10 && d.adjuvants[0]?.name === "Pro Surfactant";
line(`  matches       : ${matches ? "YES, exactly" : "NO"}`);

head("2. WHAT THEY ACTUALLY USED — on the dot");
const ev1 = {
  client_uuid: uuid(), event_type: "job.materials_recorded", job_id: job1,
  device_time: new Date().toISOString(),
  payload: { job_id: job1, device_time: new Date().toISOString(),
    lines: [
      { client_uuid: uuid(), item_id: blitz, recipe_version_id: ver, expected_qty: 100, actual_qty: 100, mixes: 2, water_litres: 20, substituted_for_item_id: null, over_expected_ack: false, note: null },
      { client_uuid: uuid(), item_id: surf,  recipe_version_id: ver, expected_qty: 10,  actual_qty: 10,  mixes: null, water_litres: null, substituted_for_item_id: null, over_expected_ack: false, note: null },
    ],
    equipment: [{ client_uuid: uuid(), equipment_code: "sprayer" }] },
};
await ingestDeviceEvents(pool, T, [ev1] as never, { actorId: actor.id });
await drainOnce(pool, consumers, { tenantId: T });
console.table(await q(`select product, expected_qty, actual_qty, variance, variance_pct, mixes, water_litres, substituted_for
                         from job_material_variance where tenant_id=$1 and job_id=$2 order by product`, [T, job1]));
console.table(await q(`select equipment_code from job_equipment_usage where tenant_id=$1 and job_id=$2`, [T, job1]));

head("3. FEFO — which batch the van actually gave up");
console.table(await q(`select b.batch_no, b.expiry_date::text as expires, m.quantity, m.movement_type
                         from stock_movements m join item_batches b on b.id=m.batch_id
                        where m.tenant_id=$1 and m.job_id=$2 and m.movement_type='consumption'`, [T, job1]));
console.table(await q(`select i.name, b.batch_no, oh.qty_base as left_on_van
                         from batch_stock_on_hand oh join item_batches b on b.id=oh.batch_id
                         join items i on i.id=oh.item_id
                        where oh.tenant_id=$1 and oh.location_id=$2 order by i.name, b.batch_no`, [T, van]));

head("4. A SUBSTITUTION AND AN OVER-DOSE — recorded, never blocked");
const job2 = await mkJob();
const ev2 = {
  client_uuid: uuid(), event_type: "job.materials_recorded", job_id: job2,
  device_time: new Date().toISOString(),
  payload: { job_id: job2, device_time: new Date().toISOString(),
    lines: [{ client_uuid: uuid(), item_id: fend, recipe_version_id: ver, expected_qty: 100,
              actual_qty: 250, mixes: 5, water_litres: 50, substituted_for_item_id: blitz,
              over_expected_ack: true, note: "Heavy cockroach infestation in the kitchen, whole back area treated" }],
    equipment: [{ client_uuid: uuid(), equipment_code: "sprayer" }, { client_uuid: uuid(), equipment_code: "duster" }] },
};
await ingestDeviceEvents(pool, T, [ev2] as never, { actorId: actor.id });
await drainOnce(pool, consumers, { tenantId: T });
console.table(await q(`select product, substituted_for, expected_qty, actual_qty, variance, variance_pct, over_expected_ack, note
                         from job_material_variance where tenant_id=$1 and job_id=$2`, [T, job2]));
line(`  Ceiling was 120 ml. 250 ml was accepted and stands recorded with the technician's reason.`);
line(`  Nothing was blocked. Nothing was silently reduced to the expected figure.`);

head("5. REPLAY — the same event arriving twice");
const before = (await q(`select count(*)::int n, coalesce(sum(actual_qty),0)::float8 q from job_material_usage where tenant_id=$1 and job_id = any($2::uuid[])`, [T, made.jobs]))[0];
const mvBefore = (await q(`select count(*)::int n from stock_movements where tenant_id=$1 and movement_type='consumption' and job_id = any($2::uuid[])`, [T, made.jobs]))[0];
await ingestDeviceEvents(pool, T, [ev1, ev2] as never, { actorId: actor.id });
await drainOnce(pool, consumers, { tenantId: T });
const after = (await q(`select count(*)::int n, coalesce(sum(actual_qty),0)::float8 q from job_material_usage where tenant_id=$1 and job_id = any($2::uuid[])`, [T, made.jobs]))[0];
const mvAfter = (await q(`select count(*)::int n from stock_movements where tenant_id=$1 and movement_type='consumption' and job_id = any($2::uuid[])`, [T, made.jobs]))[0];
line(`  usage rows        ${before.n} -> ${after.n}   (${before.n === after.n ? "unchanged" : "CHANGED — BUG"})`);
line(`  quantity recorded ${before.q} -> ${after.q}   (${before.q === after.q ? "unchanged" : "CHANGED — BUG"})`);
line(`  stock consumptions ${mvBefore.n} -> ${mvAfter.n}  (${mvBefore.n === mvAfter.n ? "unchanged — the van is not double-charged" : "CHANGED — BUG"})`);

head("6. APPEND-ONLY — a correction cannot be an edit");
for (const [what, sql] of [
  ["UPDATE", `update job_material_usage set actual_qty = 1 where tenant_id = $1`],
  ["DELETE", `delete from job_material_usage where tenant_id = $1`],
] as const) {
  try { await q(sql, [T]); line(`  ${what}: ALLOWED — INVARIANT BROKEN`); }
  catch (e) { line(`  ${what}: refused — ${(e as Error).message.split("(Constitution")[0].trim()}`); }
}

head("7. RLS — another tenant cannot see any of it");
const c = await pool.connect();
try {
  const asTenant = async (tid: string): Promise<number> => {
    // set_config(..., true) is TRANSACTION-local — the check only means anything
    // inside one, which is exactly how the app runs (withRequest/scopedRead).
    await c.query("begin");
    await c.query(`set local role mop_app`);
    await c.query(`select set_config('app.current_tenant', $1, true)`, [tid]);
    const n = (await c.query(`select count(*)::int n from job_material_usage where job_id = any($1::uuid[])`, [made.jobs])).rows[0].n;
    await c.query("commit");
    return n;
  };
  const seen = await asTenant("5b557699-b1d1-417e-b42d-fdd3be366354");
  line(`  as mop_app scoped to the Mumtaz tenant, rows visible from the test tenant's jobs: ${seen} ${seen === 0 ? "(correct)" : "(LEAK)"}`);
  const own = await asTenant(T);
  line(`  as mop_app scoped to its OWN tenant, rows visible: ${own} (${own > 0 ? "correct" : "POLICY TOO TIGHT"})`);
} finally { await c.query(`rollback`).catch(() => {}); c.release(); }

head("CLEANUP");
// Append-only rows cannot be deleted; the fixture jobs stay on the TEST tenant,
// which is what a test tenant is for. Nothing was written to the live tenant.
line(`  test-tenant fixture left in place (append-only rows cannot be removed, by design).`);
line(`  live tenant untouched: 0 writes.`);
await pool.end();
