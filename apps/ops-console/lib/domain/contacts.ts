import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Customer contacts (mig 004). Operational master: full edit + archive/restore
// (archived_at), every write audit-logged. A contact may be pinned to a specific
// branch/site or left at customer level.
export interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  is_primary: boolean;
  branch_id: string | null;
  branch_name: string | null;
  is_assumed: boolean;
  assumed_note: string | null;
  archived_at?: string | null;
}

export interface ContactInput {
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  is_primary?: boolean;
  branch_id?: string;
}

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function listContacts(tenantId: string, customerId: string, includeArchived = false): Promise<Contact[]> {
  const { rows } = await scopedRead(tenantId,
    `select c.id, c.name, c.phone, c.email, c.role, c.is_primary, c.branch_id,
            b.name as branch_name, c.is_assumed, c.assumed_note, c.archived_at::text
       from contacts c
       left join customer_branches b on b.id = c.branch_id
      where c.tenant_id = $1 and c.customer_id = $2 and ($3 or c.archived_at is null)
      order by c.archived_at nulls first, c.is_primary desc, c.name`,
    [tenantId, customerId, includeArchived],
  );
  return rows as Contact[];
}

export async function createContact(tenantId: string, serviceLineId: string, customerId: string, d: ContactInput): Promise<string> {
  if (!clean(d.name) && !clean(d.phone) && !clean(d.email)) throw new Error("A name, phone, or email is required");
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into contacts (tenant_id, service_line_id, customer_id, branch_id, name, phone, email, role, is_primary, is_assumed)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false) returning id`,
      [tenantId, serviceLineId, customerId, clean(d.branch_id), clean(d.name), clean(d.phone),
       clean(d.email), clean(d.role), d.is_primary ?? false],
    );
    await audit(c, tenantId, {
      table: "contacts", rowId: rows[0].id, action: "insert",
      newValue: d, note: "contact created in admin console",
    });
    return rows[0].id as string;
  });
}

export async function updateContact(tenantId: string, id: string, d: ContactInput): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(
      `select name, phone, email, role, is_primary, branch_id, is_assumed
         from contacts where id=$1 and tenant_id=$2 for update`, [id, tenantId],
    )).rows[0];
    if (!before) throw new Error("Contact not found");
    await c.query(
      `update contacts set name=$1, phone=$2, email=$3, role=$4, is_primary=$5, branch_id=$6
              ${before.is_assumed ? ", is_assumed=false, confirmed_at=now()" : ""}
        where id=$7`,
      [clean(d.name), clean(d.phone), clean(d.email), clean(d.role), d.is_primary ?? false, clean(d.branch_id), id],
    );
    await audit(c, tenantId, {
      table: "contacts", rowId: id, action: "update",
      oldValue: before, newValue: d, note: "contact edited in admin console",
    });
  });
}

export async function archiveContact(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update contacts set archived_at=now(), archived_by=app_current_actor() where id=$1 and tenant_id=$2 and archived_at is null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "contacts", rowId: id, action: "update", newValue: { archived: true }, note: "contact archived" });
  });
}

export async function restoreContact(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update contacts set archived_at=null, archived_by=null where id=$1 and tenant_id=$2 and archived_at is not null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "contacts", rowId: id, action: "update", newValue: { archived: false }, note: "contact restored" });
  });
}
