// §3.7 — give the field staff logins, restricted to pre-registered addresses.
//
//   node --env-file=../../.env.local --import tsx scripts/provision-employee-logins.ts staff.csv
//   …add --commit to apply. Rehearses and rolls back otherwise.
//
// The CSV is two columns, header included:  technician_code,google_email
// One row per employee. An address that is not in this file can never sign in:
// fn_link_google_identity (mig 116) matches EXACTLY and case-insensitively against
// app_users.google_email, and refuses everything else without creating anything.
//
// This script does NOT create Supabase auth users. It registers the ADDRESS
// against the employee; the auth user appears the first time that person signs in
// with Google and is linked then. That ordering is deliberate — it means a
// mistyped address fails closed (nobody can sign in) rather than open (an account
// exists that nobody expected).
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const NOOP = fileURLToPath(new URL("./_noop.cjs", import.meta.url));
const rf = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (r: string, ...a: unknown[]) {
  if (r === "server-only" || r === "client-only") return NOOP;
  return rf.call(this, r, ...a);
};

const TENANT = "5b557699-b1d1-417e-b42d-fdd3be366354";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

(async () => {
  const { withRequest } = await import("../lib/rls");
  const file = process.argv.find((a) => a.endsWith(".csv"));
  const commit = process.argv.includes("--commit");
  if (!file) { console.error("usage: provision-employee-logins.ts <staff.csv> [--commit]"); process.exit(2); }

  const rows = (await readFile(file, "utf8")).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(1)
    .map((l) => { const [code, email] = l.split(",").map((x) => x.trim()); return { code, email }; });

  class Rollback extends Error {}
  try {
    await withRequest({ tenantId: TENANT }, async (c) => {
      let ok = 0; const problems: string[] = [];
      for (const r of rows) {
        if (!r.code || !EMAIL_RE.test(r.email ?? "")) { problems.push(`${r.code ?? "(no code)"}: "${r.email ?? ""}" is not an email address`); continue; }
        const { rows: t } = await c.query(
          `select id, full_name from technicians where tenant_id=$1 and code=$2 and archived_at is null`,
          [TENANT, r.code]);
        if (!t[0]) { problems.push(`${r.code}: no active technician with that code`); continue; }

        const { rows: clash } = await c.query(
          `select u.full_name from app_users u
            where u.tenant_id=$1 and lower(u.google_email)=lower($2)
              and (u.technician_id is null or u.technician_id <> $3)`,
          [TENANT, r.email, t[0].id]);
        if (clash[0]) { problems.push(`${r.code}: ${r.email} is already registered to ${clash[0].full_name}`); continue; }

        const { rows: existing } = await c.query(
          `select id from app_users where tenant_id=$1 and technician_id=$2`, [TENANT, t[0].id]);
        if (existing[0]) {
          await c.query(`update app_users set google_email=$2, is_active=true, updated_at=now() where id=$1`,
            [existing[0].id, r.email.toLowerCase()]);
          console.log(`  ${r.code.padEnd(10)} ${t[0].full_name.padEnd(28)} google_email set on the existing login`);
        } else {
          // No auth user yet: the row is created without one and adopts the auth
          // id on first Google sign-in (mig 116). is_active=false until then would
          // block that link, so it is created active but SIGN-IN STILL REQUIRES the
          // address to match — the allowlist is the gate, not this flag.
          await c.query(
            `insert into app_users (id, tenant_id, full_name, email, google_email, technician_id, is_active)
             values (gen_random_uuid(), $1, $2, $3, $4, $5, true)`,
            [TENANT, t[0].full_name, r.email.toLowerCase(), r.email.toLowerCase(), t[0].id]);
          console.log(`  ${r.code.padEnd(10)} ${t[0].full_name.padEnd(28)} login created, awaiting first Google sign-in`);
        }
        ok++;
      }
      console.log(`\n${ok} of ${rows.length} registered.`);
      if (problems.length) { console.log("problems:"); problems.forEach((p) => console.log(`  ✗ ${p}`)); }
      if (!commit) throw new Rollback("rehearsal");
    });
    console.log("\n✅ COMMITTED.");
  } catch (e) {
    if (e instanceof Rollback) { console.log("\n↩︎  REHEARSAL ONLY — rolled back. Re-run with --commit."); process.exit(0); }
    console.error(`\n✖ ${(e as Error).message}`); process.exit(1);
  }
})();
