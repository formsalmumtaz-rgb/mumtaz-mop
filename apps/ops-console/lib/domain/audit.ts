import "server-only";
import type { PoolClient } from "pg";

// Every master-data write records who/when/old->new here (Art. VIII, Art. X §4).
export async function audit(
  client: PoolClient,
  tenantId: string,
  p: {
    table: string;
    rowId: string;
    action: "insert" | "update" | "confirm" | "soft_delete";
    oldValue?: unknown;
    newValue?: unknown;
    note?: string;
    actorId?: string | null;
  },
): Promise<void> {
  await client.query(
    `insert into audit_log (tenant_id, actor_id, table_name, row_id, action, old_value, new_value, note)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      tenantId,
      p.actorId ?? null,
      p.table,
      p.rowId,
      p.action,
      p.oldValue === undefined ? null : JSON.stringify(p.oldValue),
      p.newValue === undefined ? null : JSON.stringify(p.newValue),
      p.note ?? null,
    ],
  );
}
