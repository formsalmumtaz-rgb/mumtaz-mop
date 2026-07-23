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
