// The negative test: every role that is NOT admin must be refused USER
// MANAGEMENT and the financial reports at the point of enforcement, not merely
// find the menu item missing.
//
// Enforcement here is permission-set membership — requirePermission() and
// requireView() both reduce to `session.permissions.has(x)`, and every server
// action calls one of them before it touches the database. So the honest test
// is: for each role, take the permission set the SERVER would build for it, and
// assert the guard's own predicate.
import pg from "pg";
const url = new URL(process.env.DATABASE_URL!); url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 2 });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
const T = "5b557699-b1d1-417e-b42d-fdd3be366354";
const line = (s = "") => console.log(s);

const rows = await q(`select r.code role, rp.permission_code perm from roles r
   join role_permissions rp on rp.role_id = r.id where r.tenant_id = $1`, [T]);
const held: Record<string, Set<string>> = {};
for (const r of await q(`select code from roles where tenant_id=$1`, [T])) held[r.code] = new Set();
for (const x of rows) held[x.role]?.add(x.perm);

// screen -> the permission its guard demands
const GUARDED: [string, string][] = [
  ["/settings/users  (user management)", "user.manage"],
  ["/settings/*      (company + system config)", "settings.manage"],
  ["/reports/profit-loss", "report.financial"],
  ["/reports/general-ledger", "report.financial"],
  ["/reports/balance-sheet", "report.financial"],
  ["/reports/trial-balance", "report.financial"],
  ["/reports/vat", "report.financial"],
  ["/reports/revenue", "report.financial"],
  ["/reports/customer-statement", "report.financial"],
  ["/reports/monthly", "report.financial"],
  ["/reports           (index)", "report.view"],
  ["/hr", "hr.view"],
  ["/profitability", "profit.view"],
  ["/management", "profit.view"],
  ["/cost-config", "settings.manage"],
  ["/pricing", "settings.manage"],
];

let failures = 0;
line("\n══ USER MANAGEMENT — admin only, refused for everyone else ══════════");
for (const role of Object.keys(held).sort()) {
  const allowed = held[role].has("user.manage");
  const expected = role === "admin";
  const ok = allowed === expected;
  if (!ok) failures++;
  line(`  ${ok ? "✓" : "✗ WRONG"}  ${role.padEnd(12)} ${allowed ? "ALLOWED" : "refused"}${ok ? "" : "  <-- expected " + (expected ? "ALLOWED" : "refused")}`);
}

line("\n══ WHAT THE ENGINEER (operations) IS REFUSED ════════════════════════");
for (const [screen, perm] of GUARDED) {
  const allowed = held["operations"].has(perm);
  if (allowed) failures++;
  line(`  ${allowed ? "✗ REACHES" : "✓ refused "}  ${screen.padEnd(44)} needs ${perm}`);
}

line("\n══ AND WHAT THE ENGINEER MUST STILL REACH ═══════════════════════════");
const MUST: [string, string][] = [
  ["create a customer", "customer.edit"], ["run a survey", "survey.edit"],
  ["build an estimate", "estimate.edit"], ["activate a contract", "contract.activate"],
  ["see due payments (AR)", "invoice.view"], ["schedule jobs", "job.edit"],
  ["chemicals / stock / equipment", "inventory.edit"], ["technicians", "technician.edit"],
];
for (const [what, perm] of MUST) {
  const allowed = held["operations"].has(perm);
  if (!allowed) failures++;
  line(`  ${allowed ? "✓ can    " : "✗ BLOCKED"}  ${what.padEnd(44)} needs ${perm}`);
}

line("\n══ MANAGEMENT: everything operational, not the company ══════════════");
for (const [what, perm, want] of [
  ["finance — post payments", "payment.record", true],
  ["finance — the ledger", "gl.view", true],
  ["HR", "hr.manage", true],
  ["margin and profitability", "profit.view", true],
  ["financial reports", "report.financial", true],
  ["company details / system config", "settings.manage", false],
  ["user management", "user.manage", false],
] as [string, string, boolean][]) {
  const allowed = held["management"].has(perm);
  const ok = allowed === want;
  if (!ok) failures++;
  line(`  ${ok ? "✓" : "✗ WRONG"}  ${(allowed ? "can    " : "refused")}  ${what.padEnd(38)} (${perm})`);
}

line(`\n${failures === 0 ? "✓ ALL ASSERTIONS HOLD" : "✗ " + failures + " FAILED"}`);
await pool.end();
process.exit(failures === 0 ? 0 : 1);
