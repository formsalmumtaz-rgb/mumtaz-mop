import "server-only";
import type { PoolClient } from "pg";
import { pool } from "./db";

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

export async function withRequest<T>(ctx: RequestContext, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Phase A3 will insert here: await client.query("set local role mop_app");
    await client.query(`select set_config('app.current_tenant', $1, true)`, [ctx.tenantId]);
    await client.query(`select set_config('app.current_actor', $1, true)`, [ctx.actorId ?? ""]);
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
