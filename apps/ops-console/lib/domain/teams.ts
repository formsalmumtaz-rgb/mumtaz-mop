import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Teams are reference/config data (mig 006): they gate which teams appear in
// operational dropdowns. They carry is_active rather than archived_at — for
// config data, deactivating IS archiving (FK-safe: history keeps resolving, the
// team just drops out of new-work pickers). Nothing is ever hard-deleted.
export interface Team {
  id: string;
  code: string | null;
  name: string;
  is_active: boolean;
  is_assumed: boolean;
  assumed_note: string | null;
  confirmed_at: string | null;
}

export interface TeamInput {
  code?: string;
  name: string;
}

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function listTeams(tenantId: string, includeArchived = false): Promise<Team[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, code, name, is_active, is_assumed, assumed_note, confirmed_at::text
       from teams
      where tenant_id = $1 and ($2 or is_active)
      order by is_active desc, name`,
    [tenantId, includeArchived],
  );
  return rows as Team[];
}

export async function createTeam(tenantId: string, serviceLineId: string, d: TeamInput): Promise<string> {
  if (!d.name?.trim()) throw new Error("Name is required");
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into teams (tenant_id, service_line_id, code, name, is_assumed)
       values ($1,$2,$3,$4,false) returning id`,
      [tenantId, serviceLineId, clean(d.code), d.name.trim()],
    );
    await audit(c, tenantId, {
      table: "teams", rowId: rows[0].id, action: "insert",
      newValue: d, note: "team created in admin console",
    });
    return rows[0].id as string;
  });
}

export async function updateTeam(tenantId: string, id: string, d: TeamInput): Promise<void> {
  if (!d.name?.trim()) throw new Error("Name is required");
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(
      `select code, name, is_assumed from teams where id=$1 and tenant_id=$2 for update`, [id, tenantId],
    )).rows[0];
    if (!before) throw new Error("Team not found");
    await c.query(
      `update teams set code=$1, name=$2 ${before.is_assumed ? ", is_assumed=false, confirmed_at=now()" : ""} where id=$3`,
      [clean(d.code), d.name.trim(), id],
    );
    await audit(c, tenantId, {
      table: "teams", rowId: id, action: "update",
      oldValue: before, newValue: d, note: "team edited in admin console",
    });
  });
}

// Archive = deactivate; Restore = reactivate. Audit-logged, never hard-deleted.
export async function archiveTeam(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update teams set is_active=false where id=$1 and tenant_id=$2 and is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "teams", rowId: id, action: "update", oldValue: { is_active: true }, newValue: { is_active: false }, note: "team archived (deactivated)" });
  });
}

export async function restoreTeam(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update teams set is_active=true where id=$1 and tenant_id=$2 and not is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "teams", rowId: id, action: "update", oldValue: { is_active: false }, newValue: { is_active: true }, note: "team restored (reactivated)" });
  });
}
