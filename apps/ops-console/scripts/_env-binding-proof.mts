import Module from "node:module";
import { fileURLToPath } from "node:url";
const NOOP = fileURLToPath(new URL("./_noop.cjs", import.meta.url));
const SHIM = fileURLToPath(new URL("./_react-shim.cjs", import.meta.url));
const rf = (Module as never as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as never as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, r: string, ...a: unknown[]) {
  if (r === "server-only" || r === "client-only") return NOOP;
  if (r === "react") return SHIM;
  return rf.call(this, r, ...a);
};
const T = "5b557699-b1d1-417e-b42d-fdd3be366354";

// The binding is read at module load, so each environment needs its own child.
const env = process.env.PROOF_ENV ?? "";
process.env.MOP_ENV = env;
const { scopedRead } = await import("../lib/rls.ts");
const r = await scopedRead(T, "select current_setting('app.environment', true) as env");
console.log(`  MOP_ENV=${(env || "(unset)").padEnd(14)} -> app.environment = ${r.rows[0].env ?? "(null)"}`);
process.exit(0);
