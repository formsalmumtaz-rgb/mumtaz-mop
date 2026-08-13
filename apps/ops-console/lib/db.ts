import "server-only";
import pg from "pg";

const { Pool } = pg;

// Reuse one pool across HMR reloads / serverless invocations in the same runtime.
const globalForPool = globalThis as unknown as { _mopPool?: pg.Pool };

function createPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (see .env.local)");
  }
  // Strip query params so our explicit ssl config wins (DEBT.md D2/D3/D4).
  const url = new URL(process.env.DATABASE_URL);
  url.search = "";
  const p = new Pool({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false }, // Supabase pooler TLS — see DEBT.md D4
    // Heavy pages (customer profile) legitimately fan out ~12 scoped reads in
    // parallel; at max 5 they queue in waves and the page pays 2-3x the Mumbai
    // round-trip. The session pooler multiplexes fine at this level. (Speed
    // refresh item 1.)
    max: 12,
  });
  // Environment binding for the costing gate (mig 026): unset app.environment =>
  // 'production' => assumed costing denied, so production is fail-safe with zero
  // config. Non-production opts in via MOP_ENV.
  const MOP_ENV = process.env.MOP_ENV || "production";
  p.on("connect", (c) => {
    c.query("select set_config('app.environment', $1, false)", [MOP_ENV]).catch((e) =>
      console.error("[db] failed to set app.environment:", (e as Error).message),
    );
  });
  return p;
}

function getPool(): pg.Pool {
  if (!globalForPool._mopPool) globalForPool._mopPool = createPool();
  return globalForPool._mopPool;
}

// Lazy proxy: importing this module never reads DATABASE_URL, so `next build`
// can collect page data with no DB configured. The real pool is created on first
// use (request time). Same surface as a pg.Pool (pool.query / connect / on / end).
export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, prop, receiver) {
    const real = getPool();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
