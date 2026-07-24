// Manual one-off drain (dev utility). Processes queued events for the Mumtaz
// tenant and prints what one activated contract produced. Run:
//   node --env-file=.env.local --import tsx services/worker/scripts/drain-demo.ts
import pg from "pg";
import { drainOnce, consumers } from "../src/index.js";

const u = new URL(process.env.DATABASE_URL!);
u.search = "";
const pool = new pg.Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, max: 2 });

const { rows: [t] } = await pool.query(`select id from tenants where name='Mumtaz Integrated Services Group'`);
const drain = await drainOnce(pool, consumers, { tenantId: t.id });

const { rows: [c] } = await pool.query(
  `select id, contract_number, start_date::text s, end_date::text e
     from contracts where tenant_id=$1 and lifecycle_status='active' limit 1`, [t.id]);
const { rows: [sc] } = await pool.query(
  `select count(*)::int n, min(scheduled_date)::text f, max(scheduled_date)::text l
     from contract_schedule where contract_id=$1`, [c.id]);
const { rows: [jb] } = await pool.query(
  `select count(*)::int n, min(scheduled_date)::text f, max(scheduled_date)::text l
     from jobs where contract_id=$1`, [c.id]);
const { rows: [rm] } = await pool.query(
  `select count(*)::int n, min(due_date)::text d from reminders where entity_id=$1`, [c.id]);
const { rows: [snap] } = await pool.query(
  `select snapshot->'pricing' as pricing, snapshot->>'recipe_version_id' as recipe from contract_schedule where contract_id=$1 limit 1`, [c.id]);

console.log(JSON.stringify({
  drain, contract: c.contract_number, contract_dates: [c.s, c.e],
  schedule: sc, jobs: jb, reminder: rm, frozen_pricing: snap?.pricing, frozen_recipe: snap?.recipe,
}, null, 2));
await pool.end();
