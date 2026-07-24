import "server-only";
import type { PoolClient } from "pg";
import { pool } from "../db";

// Runs fn inside a transaction with the tenant context set (RLS backstop +
// app-layer scoping). Commits on success, rolls back on error.
export async function withTenantTx<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`select set_config('app.current_tenant', $1, true)`, [tenantId]);
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
