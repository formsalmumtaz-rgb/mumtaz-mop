#!/usr/bin/env node
// RLS gate — fails the build if a bare `pool.query(` appears outside the few
// files allowed to touch the raw pool. Every tenant read must go through
// scopedRead(tenantId, …) / withRequest (lib/rls.ts) so the A3 role flip makes
// RLS the live boundary everywhere. Ships in the SAME PR as the reads migration
// so a new bare read next week trips CI, not a reviewer.
import { execSync } from "node:child_process";

const ALLOW = new Set([
  "lib/db.ts",      // defines the pool
  "lib/rls.ts",     // withRequest / scopedRead
  "lib/auth.ts",    // identity bootstrap (resolves tenant + actor from the session)
  "lib/tenant.ts",  // tenant bootstrap (resolves the tenant itself)
  // Cross-tenant system entry points (webhook + cron sweeper). No user session by
  // design; gated by OUTBOX_DRAIN_SECRET (fail-closed in prod). New system routes
  // must be reviewed and added here.
  "app/api/outbox/drain/route.ts",
  "app/api/billing/run/route.ts",
  // Field write routes: now require a session and authorise every event/item
  // against the caller's own assignments (assignedJobIds -> scopedRead/RLS) before
  // the idempotent worker/media write runs on the pool. (field/sync no longer
  // touches the pool — it goes through scopedRead.)
  "app/api/field/upload/route.ts",
  "app/api/field/media/route.ts",
]);

let out = "";
try {
  out = execSync('grep -rEln "pool\\.query\\(" app lib', { encoding: "utf8" });
} catch {
  out = ""; // grep exits 1 when there are no matches
}
const offenders = out.split("\n").map((s) => s.trim()).filter(Boolean).filter((f) => !ALLOW.has(f));

if (offenders.length) {
  console.error("✖ RLS gate FAILED — bare pool.query() outside the allowed helpers:\n  " + offenders.join("\n  "));
  console.error("\n  Use scopedRead(tenantId, sql, params) or withRequest (lib/rls.ts).");
  process.exit(1);
}
console.log("✓ RLS gate OK — no bare pool.query() in the request paths.");
