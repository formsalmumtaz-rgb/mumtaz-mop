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
}

export async function listTechnicians(tenantId: string): Promise<Technician[]> {
  const { rows } = await scopedRead(tenantId, 
    `select id, code, full_name, phone, is_assumed, assumed_note, confirmed_at, is_active
       from technicians
      where tenant_id = $1
      order by code`,
    [tenantId],
  );
  return rows as Technician[];
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
