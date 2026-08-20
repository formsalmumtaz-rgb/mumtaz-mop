import Module from "node:module";
import { fileURLToPath } from "node:url";
const NOOP = fileURLToPath(new URL("./_noop.cjs", import.meta.url));
const rf = (Module as never as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as never as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, r: string, ...a: unknown[]) {
  if (r === "server-only" || r === "client-only") return NOOP;
  return rf.call(this, r, ...a);
};

import pg from "pg";
const url = new URL(process.env.DATABASE_URL!); url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 3 });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
const T = "5b557699-b1d1-417e-b42d-fdd3be366354";
const line = (s = "") => console.log(s);
const head = (s: string) => { line(); line("── " + s + " " + "─".repeat(Math.max(0, 62 - s.length))); };

// The fields the engineer must never receive, from the owner's own list.
const FORBIDDEN = ["est_cost", "gross_profit", "est_material_cost", "est_labour_hours",
                   "labour_rate", "vehicle_rate", "overhead_rate", "overhead_enabled",
                   "material_rate_spray_per_m2", "material_rate_gel_per_m2", "target_margin"];

head("THE ROLE MATRIX AS BUILT");
const roles = ["admin", "management", "operations", "finance", "team_lead", "technician"];
const rows = await q(`select r.code role, rp.permission_code perm from roles r
   join role_permissions rp on rp.role_id = r.id where r.tenant_id = $1`, [T]);
const held: Record<string, Set<string>> = {};
for (const r of roles) held[r] = new Set();
for (const x of rows) held[x.role]?.add(x.perm);

const CHECKS: [string, string, boolean][] = [
  // [role, permission, must-hold?]
  ["management", "settings.manage", false], ["management", "user.manage", false],
  ["management", "hr.manage", true], ["management", "billing.run", true], ["management", "profit.view", true],
  ["operations", "customer.edit", true], ["operations", "survey.edit", true],
  ["operations", "estimate.edit", true], ["operations", "contract.activate", true],
  ["operations", "invoice.view", true], ["operations", "inventory.edit", true],
  ["operations", "technician.edit", true], ["operations", "job.edit", true],
  ["operations", "profit.view", false], ["operations", "gl.view", false],
  ["operations", "expense.view", false], ["operations", "expense.record", false],
  ["operations", "report.view", false], ["operations", "report.financial", false],
  ["operations", "hr.view", false], ["operations", "hr.manage", false],
  ["operations", "settings.manage", false], ["operations", "user.manage", false],
  ["admin", "user.manage", true], ["admin", "settings.manage", true],
];
let bad = 0;
for (const [role, perm, must] of CHECKS) {
  const has = held[role].has(perm);
  const ok = has === must;
  if (!ok) bad++;
  line(`  ${ok ? "✓" : "✗ WRONG"}  ${role.padEnd(11)} ${must ? "holds    " : "must NOT hold"} ${perm}${ok ? "" : `  (actually ${has})`}`);
}
line(`\n  ${bad === 0 ? "all " + CHECKS.length + " assertions hold" : bad + " WRONG"}`);

head("WHAT A SESSION WITHOUT profit.view ACTUALLY RECEIVES");
// No stubbing. canSeeProfit() -> can("profit.view") -> getSession(), and with
// enforcement ON and no session that is false — the same false the engineer's
// session produces, through the same code path. Flipping AUTH_REQUIRED off
// takes the dev opt-out, which is the "can see everything" branch.
const est = await import("../lib/domain/estimation.ts");
const target = (await q(`select id from estimates where tenant_id=$1 order by created_at desc limit 1`, [T]))[0];
if (!target) { line("  no estimate to read"); await pool.end(); process.exit(0); }
const sl = (await q(`select id from service_lines where tenant_id=$1 and code='pest_control'`, [T]))[0].id;

let leakedAnywhere = 0;
for (const mode of ["ENGINEER (no profit.view)", "ADMIN (profit.view)"] as const) {
  if (mode.startsWith("ENGINEER")) { process.env.AUTH_REQUIRED = "true"; process.env.MOP_ENV = "production"; }
  else { process.env.MOP_ENV = "development"; process.env.AUTH_REQUIRED = "false"; }

  const e = await est.getEstimate(T, target.id);
  const d = await est.getLineDefaults(T, sl, target.id);
  const headerKeys = Object.keys(e!.header);
  const lineKeys = e!.lines[0] ? Object.keys(e!.lines[0]) : [];
  const defKeys = Object.keys(d);
  const present = FORBIDDEN.filter((f) => headerKeys.includes(f) || lineKeys.includes(f) || defKeys.includes(f));

  line(`\n  ${mode}`);
  line(`    estimate header : ${headerKeys.join(", ")}`);
  line(`    estimate line   : ${lineKeys.join(", ") || "(no lines)"}`);
  line(`    line defaults   : ${defKeys.join(", ")}`);
  line(`    cost/margin keys present: ${present.length ? present.join(", ") : "NONE"}`);
  if (mode.startsWith("ENGINEER")) {
    if (present.length) { leakedAnywhere += present.length; line(`    ✗ LEAK`); }
    else line(`    ✓ the response carries no cost or margin field at all`);
    const s2 = await est.suggestLinePrice(T, sl, target.id, { labour_hours: 2, distance_km: 30, material_cost: 40 });
    line(`    suggested price : ${JSON.stringify(s2)}`);
    line(`                      one number. No cost, no margin, no target percentage.`);
  } else {
    line(`    ${present.length ? "✓ admin still sees " + present.length + " cost/margin fields" : "✗ admin lost them — over-redacted"}`);
  }
}
line(`\n  ${leakedAnywhere === 0 ? "✓ NO COST OR MARGIN REACHES A SESSION WITHOUT profit.view" : "✗ " + leakedAnywhere + " LEAKED"}`);
await pool.end();
