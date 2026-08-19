// Commit the validated customer-master batch (Art. VII §5, final step).
//
//   node --env-file=../../.env.local --import tsx scripts/commit-master-import.ts --expect-clean 569
//
// Requires the expected clean-row count on the command line and refuses to run if
// the batch does not match it. The commit is the irreversible step — account
// numbers are permanent and never reissued (DECISIONS §12 ¶2) — so it must be
// impossible to commit a batch other than the one the owner read and approved.
// Held and rejected rows are never written.
import Module from "node:module";
import { fileURLToPath } from "node:url";

const NOOP = fileURLToPath(new URL("./_noop.cjs", import.meta.url));
const resolveFilename = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (req: string, ...rest: unknown[]) {
  if (req === "server-only" || req === "client-only") return NOOP;
  return resolveFilename.call(this, req, ...rest);
};

const TENANT = "5b557699-b1d1-417e-b42d-fdd3be366354";

(async () => {
  const { commitImportBatch } = await import("../lib/domain/imports");
  const { scopedRead } = await import("../lib/rls");
  const q = async (sql: string, p: unknown[] = []) => (await scopedRead(TENANT, sql, p)).rows;

  const i = process.argv.indexOf("--expect-clean");
  const expected = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  if (!Number.isInteger(expected)) {
    console.error("refusing to run: pass --expect-clean <n> with the clean-row count from the approved report");
    process.exit(2);
  }

  const batches = await q(
    `select id, source from import_batches where tenant_id=$1 and status='validated' order by created_at desc`, [TENANT]);
  if (batches.length !== 1) {
    console.error(`refusing to run: expected exactly one validated batch, found ${batches.length}`);
    process.exit(1);
  }
  const batchId = batches[0].id as string;
  const [counts] = await q(
    `select count(*) filter (where disposition='clean')::int as clean,
            count(*) filter (where disposition='held')::int as held,
            count(*) filter (where disposition='clean' and assigned_code !~ '^[1-9]{5}$')::int as bad_code
       from staging_customers where batch_id=$1`, [batchId]);
  if (counts.clean !== expected) {
    console.error(`refusing to run: batch has ${counts.clean} clean rows, you approved ${expected}`);
    process.exit(1);
  }
  if (counts.bad_code !== 0) {
    console.error(`refusing to run: ${counts.bad_code} clean row(s) carry a malformed account number`);
    process.exit(1);
  }

  console.log(`committing batch ${batchId} — ${counts.clean} clean, ${counts.held} held (never written)…`);
  const t0 = Date.now();
  const result = await commitImportBatch(TENANT, batchId);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, JSON.stringify(result));
  process.exit(0);
})();
