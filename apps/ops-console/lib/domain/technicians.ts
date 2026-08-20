import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";
import type { ListParams } from "../list";

export interface Technician {
  id: string;
  code: string | null;
  full_name: string | null;
  phone: string | null;
  employee_ref: string | null;
  is_assumed: boolean;
  assumed_note: string | null;
  confirmed_at: string | null;
  is_active: boolean;
  archived_at?: string | null;
}

export interface TechnicianInput {
  code?: string;
  full_name?: string;
  phone?: string;
  employee_ref?: string;
}

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

const SELECT = `select id, code, full_name, phone, employee_ref, is_assumed, assumed_note,
                       confirmed_at::text, is_active, archived_at::text
                  from technicians`;

export async function listTechnicians(tenantId: string, includeArchived = false): Promise<Technician[]> {
  const { rows } = await scopedRead(tenantId,
    `${SELECT}
      where tenant_id = $1 and ($2 or archived_at is null)
      order by archived_at nulls first, code`,
    [tenantId, includeArchived],
  );
  return rows as Technician[];
}

// Paged + searchable (code, name, phone, or employee ref).
export async function listTechniciansPaged(
  tenantId: string, p: ListParams,
): Promise<{ rows: Technician[]; total: number }> {
  const q = p.q.trim();
  const like = `%${q}%`;
  const archFilter = p.includeArchived ? `` : `and archived_at is null`;
  const qFilter = q ? `and (code ilike $2 or full_name ilike $2 or phone ilike $2 or employee_ref ilike $2)` : ``;
  const params = q ? [tenantId, like] : [tenantId];
  const { rows: cnt } = await scopedRead(tenantId,
    `select count(*)::int as n from technicians where tenant_id=$1 ${archFilter} ${qFilter}`, params);
  const { rows } = await scopedRead(tenantId,
    `${SELECT}
      where tenant_id=$1 ${archFilter} ${qFilter}
      order by archived_at nulls first, code
      limit ${p.pageSize} offset ${p.offset}`, params);
  return { rows: rows as Technician[], total: cnt[0]?.n ?? 0 };
}

// Add a technician. A manually-added record is a real one (not ASSUMED).
export async function createTechnician(tenantId: string, serviceLineId: string, d: TechnicianInput): Promise<string> {
  if (!clean(d.code) && !clean(d.full_name)) throw new Error("A code or name is required");
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into technicians (tenant_id, service_line_id, code, full_name, phone, employee_ref, is_assumed)
       values ($1,$2,$3,$4,$5,$6,false) returning id`,
      [tenantId, serviceLineId, clean(d.code), clean(d.full_name), clean(d.phone), clean(d.employee_ref)],
    );
    await audit(c, tenantId, {
      table: "technicians", rowId: rows[0].id, action: "insert",
      newValue: d, note: "technician created in admin console",
    });
    return rows[0].id as string;
  });
}

// Full edit. Entering a real name also clears the ASSUMED flag (once a human has
// vouched for the record it is no longer a placeholder).
export async function updateTechnician(tenantId: string, id: string, d: TechnicianInput): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(
      `select code, full_name, phone, employee_ref, is_assumed
         from technicians where id=$1 and tenant_id=$2 for update`, [id, tenantId],
    )).rows[0];
    if (!before) throw new Error("Technician not found");
    const clears = before.is_assumed && !!clean(d.full_name);
    await c.query(
      `update technicians set code=$1, full_name=$2, phone=$3, employee_ref=$4
              ${clears ? ", is_assumed=false, confirmed_at=now()" : ""}
        where id=$5`,
      [clean(d.code), clean(d.full_name), clean(d.phone), clean(d.employee_ref), id],
    );
    await audit(c, tenantId, {
      table: "technicians", rowId: id, action: "update",
      oldValue: before,
      newValue: { ...d, ...(clears ? { is_assumed: false } : {}) },
      note: clears ? "technician edited (ASSUMED cleared)" : "technician edited in admin console",
    });
  });
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

/**
 * Item 2 — the surveyor picker.
 *
 * A survey is usually booked by whoever is at a desk, so the list is the whole
 * staff list with office roles suggested first, not technicians alphabetically.
 * `is_office` marks anyone holding a console role rather than being a field
 * technician; the caller groups on it.
 */
export async function listStaffForPicker(
  tenantId: string,
): Promise<{ id: string; full_name: string; is_office: boolean }[]> {
  const { rows } = await scopedRead(tenantId,
    `select t.id,
            coalesce(t.full_name, t.code, 'Technician') as full_name,
            false as is_office
       from technicians t
      where t.tenant_id = $1 and t.archived_at is null and coalesce(t.is_active, true)
      union all
     select u.id,
            coalesce(u.full_name, u.email, 'Staff') as full_name,
            true as is_office
       from app_users u
      where u.tenant_id = $1 and u.status = 'active' and u.technician_id is null
      order by is_office desc, full_name`,
    [tenantId]);
  return rows as { id: string; full_name: string; is_office: boolean }[];
}
