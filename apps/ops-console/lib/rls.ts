import "server-only";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { pool } from "./db";

// Unset => "production" => assumed costing refused (mig 026). Fail-safe by default.
//
// Constrained to a known set and inlined rather than parameterised, because the
// preamble is a MULTI-STATEMENT simple query and Postgres does not accept bind
// parameters on those — passing $1 makes pg switch to the extended protocol,
// which then rejects the multiple statements. Anything unrecognised becomes
// "production", so a typo fails safe rather than opening the costing gate.
const ALLOWED_ENVS = ["development", "dev", "staging", "test", "production"];
const RAW_ENV = (process.env.MOP_ENV || "").toLowerCase().trim();
const MOP_ENV = ALLOWED_ENVS.includes(RAW_ENV) ? RAW_ENV : "production";

// The single choke point for tenant + actor scoped database access.
//
// Phase A1 (now): sets app.current_tenant (+ app.current_actor when known) inside
// a transaction, but KEEPS the current privileged connection role — so behaviour
// is identical to the previous withTenantTx. Reads still bypass RLS via the
// superuser role for now.
//
// Phase A3 (later, ONE line here): add `set local role mop_app` so RLS becomes the
// live boundary. Because every write already flows through this function (and the
// reads will be migrated onto it before the flip), that single change makes the
// whole app enforce isolation — with no other call site touched.
export interface RequestContext {
  tenantId: string;
  actorId?: string | null; // authenticated user id (Phase A2 populates this)
}

// Ergonomic scoped read: a one-shot query inside a tenant/actor-scoped
// transaction. All domain reads use this instead of the bare pool, so the
// A3 role flip (in withRequest) makes every read RLS-enforced with no further
// change. Enforced by the pool.query gate (scripts/rls-gate.mjs).
// Default row type is `any` to match the previous pool.query ergonomics (callers
// cast `.rows` themselves), so this is a behaviour-preserving swap.
export async function scopedRead<T extends QueryResultRow = any>(
  tenantId: string,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return withRequest({ tenantId }, (c) => c.query<T>(sql, params));
}

// The database is ~30-50ms away (Mumbai pooler); every round trip is paid in
// user-visible latency. The transaction preamble (begin + role drop + tenant +
// actor) is ONE round trip: tenant/actor are strictly validated UUIDs inlined
// into a multi-statement simple query — identical semantics to the previous
// four-trip version (set local role mop_app; txn-scoped set_config), just not
// four network waits. Speed refresh item 1.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withRequest<T>(ctx: RequestContext, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(ctx.tenantId)) throw new Error("withRequest: tenantId is not a UUID");
  const actor = ctx.actorId ?? "";
  if (actor !== "" && !UUID_RE.test(actor)) throw new Error("withRequest: actorId is not a UUID");
  const client = await pool.connect();
  try {
    // A3 flip lives here: RLS is the LIVE boundary for every app read/write.
    // `set local` reverts at commit/rollback; the pool gets back a clean
    // (privileged) connection. Values are inlined ONLY after UUID validation.
    // app.environment rides along in the SAME round trip. It used to be set by
    // a pool `connect` hook, which fired an unawaited query on a client the pool
    // then handed straight to a waiting caller — under pool pressure that is the
    // pg deprecation, and pg 9 removes it. Transaction-scoped (`true`) rather
    // than session-scoped: a pooled connection should not carry one request's
    // environment into the next. Unset still reads as production, so the costing
    // gate stays fail-safe with zero configuration.
    await client.query(
      `begin; set local role mop_app; ` +
      `select set_config('app.current_tenant', '${ctx.tenantId}', true), ` +
      `set_config('app.current_actor', '${actor}', true), ` +
      `set_config('app.environment', '${MOP_ENV}', true)`,
    );
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
