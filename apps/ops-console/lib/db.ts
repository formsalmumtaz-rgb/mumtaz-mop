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
  // The costing-gate environment binding used to live in a `connect` hook here.
  // It moved into the withRequest preamble (lib/rls.ts) — same round trip, no
  // unawaited query on a client the pool is about to hand to someone else.
  // See DEBT.md D-KEEP1 for why it was kept for a while, and why that was wrong.
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
