import Module from "node:module";
import { fileURLToPath } from "node:url";
const NOOP = fileURLToPath(new URL("./_noop.cjs", import.meta.url));
const REACT_SHIM = fileURLToPath(new URL("./_react-shim.cjs", import.meta.url));
const rf = (Module as never as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as never as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, r: string, ...a: unknown[]) {
  if (r === "server-only" || r === "client-only") return NOOP;
  if (r === "react") return REACT_SHIM;
  return rf.call(this, r, ...a);
};
process.env.MOP_ENV = "development"; process.env.AUTH_REQUIRED = "false";
import pg from "pg";
const url = new URL(process.env.DATABASE_URL!); url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 2 });
const T = "5b557699-b1d1-417e-b42d-fdd3be366354";
const ref = await import("../lib/domain/reference.ts");
const pricing = await import("../lib/domain/pricing.ts");

const lines = (await pool.query(`select id, code from service_lines where tenant_id=$1 order by code`, [T])).rows;
for (const sl of lines) {
  const svc = await ref.listServiceTypes(T, sl.id);
  const pm = await pricing.listPricingModels(T, sl.id);
  console.log(`\n── ${sl.code.toUpperCase()} ${"─".repeat(Math.max(0, 44 - sl.code.length))}`);
  console.log(`   services : ${svc.map((s) => s.name).join(" · ")}`);
  console.log(`   pricing  : ${pm.map((p) => p.name).join(" · ")}`);
}
const all = await pricing.listPricingModels(T, null, { includeAdvanced: true });
console.log(`\n   the settings screen still sees all ${all.length} pricing models, advanced included.`);
await pool.end();
