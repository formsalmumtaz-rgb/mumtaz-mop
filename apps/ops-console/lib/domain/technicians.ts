import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

export interface Technician {
  id: string;
  code: string | null;
  full_name: string | null;
  phone: string | null;
  is_assumed: boolean;
  assumed_note: string | null;
  confirmed_at: string | null;
  is_active: boolean;
  archived_at?: string | null;
}

export async function listTechnicians(tenantId: string, includeArchived = false): Promise<Technician[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, code, full_name, phone, is_assumed, assumed_note, confirmed_at, is_active, archived_at::text
       from technicians
      where tenant_id = $1 and ($2 or archived_at is null)
      order by archived_at nulls first, code`,
    [tenantId, includeArchived],
  );
  return rows as Technician[];
}

export async function archiveTechnician(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update technicians set archived_at=now(), archived_by=app_current_actor() where id=$1 and tenant_id=$2 and archived_at is null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "technicians", rowId: id, action: "update", newValue: { archived: true }, note: "technician archived" });
  });
}

export async function restoreTechnician(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update technicians set archived_at=null, archived_by=null where id=$1 and tenant_id=$2 and archived_at is not null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "technicians", rowId: id, action: "update", newValue: { archived: false }, note: "technician restored" });
  });
}

// Confirm an ASSUMED technician as-is (clears the flag, audit-logged).
export async function confirmTechnician(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `select is_assumed from technicians where id = $1 and tenant_id = $2 for update`,
      [id, tenantId],
    );
    if (!rows[0]) throw new Error("Technician not found");
    if (!rows[0].is_assumed) return; // already confirmed
    await c.query(
      `update technicians set is_assumed = false, confirmed_at = now() where id = $1`,
      [id],
    );
    await audit(c, tenantId, {
      table: "technicians",
      rowId: id,
      action: "confirm",
      oldValue: { is_assumed: true },
      newValue: { is_assumed: false },
      note: "ASSUMED value confirmed in admin console",
    });
  });
}

// Edit the technician's real name. Entering a real name also clears ASSUMED.
export async function updateTechnicianName(
  tenantId: string,
  id: string,
  fullName: string,
): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `select full_name, is_assumed from technicians where id = $1 and tenant_id = $2 for update`,
      [id, tenantId],
    );
    if (!rows[0]) throw new Error("Technician not found");
    const before = rows[0];
    await c.query(
      `update technicians set full_name = $1, is_assumed = false, confirmed_at = now() where id = $2`,
      [fullName, id],
    );
    await audit(c, tenantId, {
      table: "technicians",
      rowId: id,
      action: "update",
      oldValue: { full_name: before.full_name, is_assumed: before.is_assumed },
      newValue: { full_name: fullName, is_assumed: false },
      note: "name edited in admin console",
    });
  });
}
