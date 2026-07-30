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

if (!globalForPool._mopPool) {
  // Environment binding for the costing gate (mig 026): unset app.environment =>
  // 'production' => assumed costing denied, so production is fail-safe with zero
  // config. Non-production opts in via MOP_ENV. Session pooler => persists per
  // connection. Attached once (pool is reused across HMR).
  const MOP_ENV = process.env.MOP_ENV || "production";
  pool.on("connect", (c) => {
    c.query("select set_config('app.environment', $1, false)", [MOP_ENV]).catch((e) =>
      console.error("[db] failed to set app.environment:", (e as Error).message),
    );
  });
  globalForPool._mopPool = pool;
}
