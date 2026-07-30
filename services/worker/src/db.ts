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

// Environment binding for the costing gate (mig 026). The gate treats an unset
// app.environment as 'production' and refuses assumed-costing there, so production
// is fail-safe with zero config. Non-production sets MOP_ENV to opt in. Session
// pooler => a session-level set_config on connect persists for the connection.
const MOP_ENV = process.env.MOP_ENV || "production";
pool.on("connect", (c) => {
  c.query("select set_config('app.environment', $1, false)", [MOP_ENV]).catch((e) =>
    console.error("[db] failed to set app.environment:", (e as Error).message),
  );
});
