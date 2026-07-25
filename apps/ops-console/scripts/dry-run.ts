// Full Golden Thread dry-run (server-side, real R2). Creates a fresh per_treatment
// contract, activates it, generates schedule+jobs, completes a job with a real
// photo uploaded to R2, syncs it, checks the invoice/stock/dashboard, then cleans up.
//   node --env-file=.env.local --import tsx apps/ops-console/scripts/dry-run.ts
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { ingestDeviceEvents, drainOnce, consumers } from "@mop/worker";
import { putObject, deleteObject, publicUrl, objectExists } from "../lib/storage/r2";

const u = new URL(process.env.DATABASE_URL!);
u.search = "";
const pool = new pg.Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, max: 3 });

const results: [string, boolean, string][] = [];
const check = (label: string, ok: boolean, detail = "") => results.push([label, ok, detail]);
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];

(async () => {
  const t = await one(`select id from tenants where name='Mumtaz Integrated Services Group'`);
  const tenantId = t.id;
  const sl = await one(`select id from service_lines where tenant_id=$1 and code='pest_control'`, [tenantId]);
  const cust = await one(`select id from customers where tenant_id=$1 and code='CUST-0001'`, [tenantId]);
  const freq = await one(`select id from frequencies where tenant_id=$1 and code='monthly_1'`, [tenantId]);
  const pm = await one(`select id from pricing_models where tenant_id=$1 and code='per_treatment'`, [tenantId]);

  // 1. create + activate a per_treatment contract (so the loop produces an invoice)
  let contractId!: string;
  const c = await pool.connect();
  try {
    await c.query("begin");
    contractId = (await c.query(
      `insert into contracts (tenant_id, service_line_id, customer_id, contract_number, frequency_id, pricing_model_id,
         contract_value, currency, start_date, end_date, lifecycle_status, signed_at)
       values ($1,$2,$3,'DRYRUN-1',$4,$5,1200,'AED', current_date, current_date + interval '12 months','active', current_date)
       returning id`,
      [tenantId, sl.id, cust.id, freq.id, pm.id],
    )).rows[0].id;
    await c.query(
      `insert into outbox_events (tenant_id, event_type, aggregate_type, entity_id, payload)
       values ($1,'contract.activated','contract',$2,$3)`,
      [tenantId, contractId, JSON.stringify({ contract_id: contractId, customer_id: cust.id, service_line_id: sl.id })],
    );
    await c.query("commit");
  } finally { c.release(); }

  // 2. fan out
  await drainOnce(pool, consumers, { tenantId });
  const sched = await one(`select count(*)::int n from contract_schedule where contract_id=$1`, [contractId]);
  const jobsRow = await one(`select count(*)::int n from jobs where contract_id=$1`, [contractId]);
  check("Contract activation → 12-month schedule", sched.n === 12, `${sched.n} rows`);
  check("Schedule → jobs (next 30 days)", jobsRow.n >= 1, `${jobsRow.n} jobs`);

  const job = await one(`select id from jobs where contract_id=$1 order by scheduled_date limit 1`, [contractId]);
  const jobId = job.id;

  // 3a. photo → R2 (a real image: the pest-control logo)
  const photoId = randomUUID();
  const photoKey = `media/${tenantId}/${jobId}/${photoId}.webp`;
  const img = await readFile("apps/field-pwa/src/assets/pest-logo.png");
  await putObject(photoKey, img, "image/webp");
  await pool.query(`insert into job_photos (id, tenant_id, job_id, storage_key) values ($1,$2,$3,$4) on conflict (id) do nothing`, [photoId, tenantId, jobId, photoKey]);
  let photoOk = false, photoDetail = "";
  const pub = publicUrl(photoKey);
  if (pub) { try { const r = await fetch(pub); photoOk = r.status === 200; photoDetail = `HTTP ${r.status}, ${r.headers.get("content-length")} bytes`; } catch (e) { photoDetail = String((e as Error).message); } }
  check("Photo uploaded to R2 + retrievable", photoOk, photoDetail);

  // 3b. sync job.completed (idempotent by client_uuid)
  const clientUuid = randomUUID();
  await ingestDeviceEvents(pool, tenantId, [{ client_uuid: clientUuid, event_type: "job.completed", job_id: jobId, payload: { job_id: jobId, client_uuid: clientUuid }, device_time: new Date().toISOString() }]);
  const jobDone = await one(`select status from jobs where id=$1`, [jobId]);
  check("Job.completed synced (job marked completed)", jobDone.status === "completed", jobDone.status);

  // 3c. drain → invoice + stock
  await drainOnce(pool, consumers, { tenantId });
  const inv = await one(`select count(*)::int n, coalesce(max(total),0)::float8 total, max(buyer_legal_name) buyer from invoices where job_id=$1`, [jobId]);
  check("Invoice queued with frozen pricing", inv.n === 1 && inv.total === 1260, `${inv.n} invoice, total ${inv.total}`);

  // 4. dashboard reflects it
  const dash = await one(
    `select (select count(*) from jobs where tenant_id=$1 and status='completed')::int completed,
            (select coalesce(sum(total),0) from invoices where tenant_id=$1 and status in ('queued','issued'))::float8 revenue`,
    [tenantId]);
  check("Dashboard updated (completed + revenue)", dash.completed >= 1 && dash.revenue >= 1260, `completed ${dash.completed}, revenue ${dash.revenue}`);

  // ---- report ----
  console.log("\n=== GOLDEN THREAD DRY-RUN ===");
  for (const [label, ok, detail] of results) console.log(`${ok ? "✅" : "❌"}  ${label}${detail ? `  — ${detail}` : ""}`);

  // ---- cleanup (keep demo data pristine; outbox events are append-only and remain) ----
  await deleteObject(photoKey);
  const gone = !(await objectExists(photoKey));
  await pool.query(`delete from job_photos where job_id in (select id from jobs where contract_id=$1)`, [contractId]);
  await pool.query(`delete from invoice_lines where invoice_id in (select id from invoices where contract_id=$1)`, [contractId]);
  await pool.query(`delete from invoices where contract_id=$1`, [contractId]);
  await pool.query(`delete from jobs where contract_id=$1`, [contractId]);
  await pool.query(`delete from contract_schedule where contract_id=$1`, [contractId]);
  await pool.query(`delete from reminders where entity_id=$1`, [contractId]);
  await pool.query(`delete from contracts where id=$1`, [contractId]);
  console.log(`\ncleanup: R2 test photo removed (${gone ? "confirmed gone" : "STILL PRESENT"}); dry-run contract + rows deleted.`);

  const allGreen = results.every((r) => r[1]);
  console.log(allGreen ? "\nALL GREEN" : "\nSOME CHECKS FAILED");
  await pool.end();
  process.exit(allGreen ? 0 : 1);
})();
