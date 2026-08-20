// Produces the EXACT payload /api/field/sync returns for the walkthrough
// technician, by running the route's OWN SQL against the database — the queries
// are read out of the route file, not re-typed, so this cannot drift from it.
// (The route itself needs a Supabase session, which this environment has no
// service-role key to mint; the SQL is the part that matters for rendering.)
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
const url = new URL(process.env.DATABASE_URL!); url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 3 });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
const T = "8fb05e65-0c81-45d2-bbc8-f03927150133";
const USER = process.argv[2];

const src = readFileSync("app/api/field/sync/route.ts", "utf8");
const blocks = [...src.matchAll(/`(select[\s\S]*?)`,\s*\n?\s*\[session\.tenantId(?:, session\.userId)?\],/g)].map((m) => m[1]);

// classify by what the query actually reads, not by its position in the file
const pick = (needle: string) => blocks.find((b) => b.includes(needle));
const run = async (b: string | undefined, label: string) => {
  if (!b) { console.error(`  ${label}: NOT FOUND in the route`); return []; }
  const params = b.includes("$2") ? [T, USER] : [T];
  try { return await q(b, params); }
  catch (e) { console.error(`  ${label}: ${(e as Error).message}`); return []; }
};

const payload = {
  jobs: await run(pick("fn_expected_dose"), "jobs"),
  inspection_options: await run(pick("from inspection_options"), "inspection_options"),
  van_stock: await run(pick("batch_stock_on_hand"), "van_stock"),
  declared_stock: await run(pick("preflight_stock_declarations"), "declared_stock"),
  equipment_options: await run(pick("preflight_checklist_items"), "equipment_options"),
  dosing_warn_over_pct: Number(((await run(pick("dosing.over_expected_warn_pct"), "dosing"))[0] as { pct?: number })?.pct ?? 100),
  me: (await run(pick("confirmed_today"), "me"))[0] ?? null,
  staff: await run(pick("from app_users"), "staff"),
};
writeFileSync(process.argv[3], JSON.stringify(payload, null, 2));
console.error(`jobs ${payload.jobs.length} · declared ${payload.declared_stock.length} · equipment ${payload.equipment_options.length} · warn ${payload.dosing_warn_over_pct}%`);
console.error(`me: ${JSON.stringify(payload.me)}`);
console.error(`expected: ${JSON.stringify((payload.jobs as { expected?: { why: string } }[])[0]?.expected?.why)}`);
await pool.end();
