import "server-only";
import type { PoolClient } from "pg";
import { withRequest } from "../rls";

// Tenant-scoped transaction. Now delegates to the single choke point (withRequest)
// so the Phase A3 role flip happens in exactly one place. Behaviour is unchanged
// in Phase A1: same tenant GUC, same privileged role; the actor GUC is simply
// unset here (wired to the authenticated user in Phase A2).
export async function withTenantTx<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withRequest({ tenantId }, fn);
}
