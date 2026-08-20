// Postgres connection pool for the worker. Uses the Supabase IPv4 session pooler
// via DATABASE_URL (see DEBT.md D3). Password is URL-encoded (DEBT.md D2).
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — run with `node --env-file=.env.local ...`");
}

// Strip query params (e.g. sslmode=require) so our explicit ssl config wins.
// The Supabase pooler chain is treated as self-signed by Node, so we enable TLS
// but skip chain verification (rejectUnauthorized:false) rather than bundling a CA.
const url = new URL(process.env.DATABASE_URL);
url.search = "";

export const pool = new Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false }, // Supabase pooler TLS
  max: 4,
});

// The costing-gate environment binding used to live in a `connect` hook here.
// It fired an unawaited query on a client the pool then handed straight to a
// waiting caller; under pool pressure pg warns, and pg 9 removes that path.
// It now happens in bindEnvironment(), awaited, where a client is acquired.
// See DEBT.md D-KEEP1 — including why keeping it was the wrong call.
const MOP_ENV_ALLOWED = ["development", "dev", "staging", "test", "production"];
const RAW = (process.env.MOP_ENV || "").toLowerCase().trim();
export const MOP_ENV = MOP_ENV_ALLOWED.includes(RAW) ? RAW : "production";

/**
 * Bind the costing gate's environment on a freshly acquired client. Awaited, so
 * nothing else is issued on this client while it is in flight. Unset still
 * reads as production, so a failure here refuses assumed costing rather than
 * allowing it.
 */
export async function bindEnvironment(c: { query: (q: string) => Promise<unknown> }): Promise<void> {
  await c.query(`select set_config('app.environment', '${MOP_ENV}', false)`);
}
