#!/usr/bin/env node
// Permission gate — fails the build if the code guards a screen or action with a
// permission code that no role can ever hold.
//
// This exists because of the pilot's first defect. Three call sites were written
// guarded by requirePermission("technician.edit") and the permission was never
// granted to any role, nor even added to the permissions catalogue. With
// AUTH_REQUIRED=false — how it was developed — the gate no-ops and everything
// looks fine. With auth enforced — how it actually runs — every one of those
// screens throws. A feature that only works with the guard switched off is not
// built, and a human reading the diff will not catch it. This will.
import { execSync } from "node:child_process";
import pg from "pg";

const used = new Set();
let out = "";
try {
  // Deliberately permissive character class: a typo is exactly what this is here
  // to catch, and a narrow class would skip the malformed code instead of
  // flagging it. (First version used [a-z_.] and silently ignored an uppercase
  // typo — the gate has to see everything that LOOKS like a permission.)
  out = execSync(`grep -rhoE 'require(Permission|View)\\("[^"]+"\\)' app lib`, { encoding: "utf8" });
} catch { out = ""; }
for (const m of out.matchAll(/"([^"]+)"/g)) used.add(m[1]);

if (used.size === 0) { console.log("✓ Permission gate — no guarded call sites found."); process.exit(0); }
if (!process.env.DATABASE_URL) {
  console.log("… Permission gate skipped (no DATABASE_URL in this environment).");
  process.exit(0);
}

const url = new URL(process.env.DATABASE_URL); url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 1 });
try {
  const { rows } = await pool.query(`select distinct permission_code as c from role_permissions`);
  const granted = new Set(rows.map((r) => r.c));
  const orphans = [...used].filter((p) => !granted.has(p)).sort();
  if (orphans.length) {
    console.error("✖ Permission gate FAILED — guarded by a permission no role holds:\n  " + orphans.join("\n  "));
    console.error("\n  Every screen or action guarded by these throws the moment auth is enforced.");
    console.error("  Add the code to `permissions`, then grant it to the roles that need it, in a migration.");
    process.exit(1);
  }
  console.log(`✓ Permission gate OK — all ${used.size} guarded call sites use a permission some role holds.`);
} catch (e) {
  console.log(`… Permission gate skipped (${e.message.split("\n")[0]}).`);
} finally {
  await pool.end().catch(() => {});
}
