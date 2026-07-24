import "server-only";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (see .env.local)");
}

// Strip query params so our explicit ssl config wins (DEBT.md D2/D3/D4).
const url = new URL(process.env.DATABASE_URL);
url.search = "";

// Reuse one pool across HMR reloads in dev.
const globalForPool = globalThis as unknown as { _mopPool?: pg.Pool };

export const pool =
  globalForPool._mopPool ??
  new Pool({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false }, // Supabase pooler TLS — see DEBT.md D4
    max: 5,
  });

if (!globalForPool._mopPool) globalForPool._mopPool = pool;
