import Module from "node:module";
import { fileURLToPath } from "node:url";
const NOOP = fileURLToPath(new URL("./_noop.cjs", import.meta.url));
const rf = (Module as never as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as never as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, r: string, ...a: unknown[]) {
  if (r === "server-only" || r === "client-only") return NOOP;
  return rf.call(this, r, ...a);
};
process.env.MOP_ENV = "development"; process.env.AUTH_REQUIRED = "false";

const T = "5b557699-b1d1-417e-b42d-fdd3be366354";
const time = async (label: string, fn: () => Promise<unknown>, n = 3) => {
  const runs: number[] = [];
  for (let i = 0; i < n; i++) { const t = Date.now(); await fn(); runs.push(Date.now() - t); }
  runs.sort((a, b) => a - b);
  console.log(`  ${label.padEnd(42)} ${String(runs[1]).padStart(5)}ms   (${runs.join(", ")})`);
  return runs[1];
};

const { scopedRead, withRequest } = await import("../lib/rls.ts");
const ref = await import("../lib/domain/reference.ts");
const est = await import("../lib/domain/estimation.ts");

console.log("\n── WHERE THE TIME GOES (median of 3, Mumbai pooler) ──────────────");
await time("one bare pool round trip (select 1)", async () => {
  const { pool } = await import("../lib/db.ts");
  await pool.query("select 1");
});
await time("scopedRead (begin+role+config+query+commit)", () => scopedRead(T, "select 1"));
await time("withRequest with 3 queries inside", () => withRequest({ tenantId: T }, async (c) => {
  await c.query("select 1"); await c.query("select 2"); await c.query("select 3");
}));
await time("getServiceLineId()", () => ref.getServiceLineId(T));
await time("ensureBaseLocation()", () => est.ensureBaseLocation(T));
const sl = await ref.getServiceLineId(T);
const e = (await scopedRead(T, "select id from estimates where tenant_id=$1 limit 1", [T])).rows[0];
await time("getLineDefaults()", () => est.getLineDefaults(T, sl, e.id));
await time("listEstimates()", () => est.listEstimates(T));
await time("listServiceTypes()", () => ref.listServiceTypes(T, sl));
console.log();
process.exit(0);
