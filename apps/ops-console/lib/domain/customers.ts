import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";
import type { ListParams } from "../list";

export interface Customer {
  id: string;
  code: string | null;
  legal_name: string | null;
  trade_name: string | null;
  trn: string | null;
  trade_license: string | null;
  customer_type: string | null;
  emirate: string | null;
  is_assumed: boolean;
  is_active: boolean;
  archived_at?: string | null;
}

export interface CustomerInput {
  legal_name?: string;
  trade_name?: string;
  trn?: string;
  trade_license?: string;
  customer_type?: string; // '', 'B2B', 'B2G', 'B2C'
  emirate?: string;
}

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

// Active (non-archived) customers for dropdowns/pickers.
export async function listCustomers(tenantId: string, search?: string): Promise<Customer[]> {
  const term = (search ?? "").trim();
  const { rows } = await scopedRead(tenantId,
    `select id, code, legal_name, trade_name, trn, trade_license, customer_type, emirate, is_assumed, is_active, archived_at::text
       from customers
      where tenant_id = $1 and archived_at is null
        and ($2 = '' or trade_name ilike '%'||$2||'%' or legal_name ilike '%'||$2||'%' or code ilike '%'||$2||'%')
      order by created_at desc`,
    [tenantId, term],
  );
  return rows as Customer[];
}

// Paginated list for the customers page: search + include-archived + total count.
export async function listCustomersPaged(tenantId: string, p: ListParams): Promise<{ rows: Customer[]; total: number }> {
  const where = `where tenant_id = $1
        and ($2 = '' or trade_name ilike '%'||$2||'%' or legal_name ilike '%'||$2||'%' or code ilike '%'||$2||'%')
        and ($3 or archived_at is null)`;
  const { rows } = await scopedRead(tenantId,
    `select id, code, legal_name, trade_name, trn, trade_license, customer_type, emirate, is_assumed, is_active, archived_at::text
       from customers ${where}
      order by archived_at nulls first, created_at desc
      limit $4 offset $5`,
    [tenantId, p.q, p.includeArchived, p.pageSize, p.offset],
  );
  const { rows: cnt } = await scopedRead(tenantId, `select count(*)::int n from customers ${where}`, [tenantId, p.q, p.includeArchived]);
  return { rows: rows as Customer[], total: cnt[0].n as number };
}

export async function archiveCustomer(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update customers set archived_at=now(), archived_by=app_current_actor() where id=$1 and tenant_id=$2 and archived_at is null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "customers", rowId: id, action: "update", newValue: { archived: true }, note: "customer archived" });
  });
}

export async function restoreCustomer(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update customers set archived_at=null, archived_by=null where id=$1 and tenant_id=$2 and archived_at is not null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "customers", rowId: id, action: "update", newValue: { archived: false }, note: "customer restored" });
  });
}

export async function getCustomer(tenantId: string, id: string): Promise<Customer | null> {
  const { rows } = await scopedRead(tenantId, 
    `select id, code, legal_name, trade_name, trn, trade_license, customer_type, emirate, is_assumed, is_active
       from customers where id = $1 and tenant_id = $2`,
    [id, tenantId],
  );
  return (rows[0] as Customer) ?? null;
}

export async function createCustomer(
  tenantId: string,
  serviceLineId: string,
  data: CustomerInput,
): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    const { rows: cnt } = await c.query(`select count(*)::int n from customers where tenant_id = $1`, [tenantId]);
    const code = "CUST-" + String(cnt[0].n + 1).padStart(4, "0");
    const { rows } = await c.query(
      `insert into customers
         (tenant_id, service_line_id, code, legal_name, trade_name, trn, trade_license, customer_type, emirate, is_assumed)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false)
       returning id`,
      [tenantId, serviceLineId, code, clean(data.legal_name), clean(data.trade_name), clean(data.trn),
       clean(data.trade_license), clean(data.customer_type), clean(data.emirate)],
    );
    await audit(c, tenantId, {
      table: "customers", rowId: rows[0].id, action: "insert",
      newValue: { code, ...data }, note: "created in admin console",
    });
    return rows[0].id as string;
  });
}

export async function updateCustomer(tenantId: string, id: string, data: CustomerInput): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `select legal_name, trade_name, trn, trade_license, customer_type, emirate
         from customers where id = $1 and tenant_id = $2 for update`,
      [id, tenantId],
    );
    if (!rows[0]) throw new Error("Customer not found");
    await c.query(
      `update customers set legal_name=$1, trade_name=$2, trn=$3, trade_license=$4,
              customer_type=$5, emirate=$6, is_assumed=false where id=$7`,
      [clean(data.legal_name), clean(data.trade_name), clean(data.trn), clean(data.trade_license),
       clean(data.customer_type), clean(data.emirate), id],
    );
    await audit(c, tenantId, {
      table: "customers", rowId: id, action: "update",
      oldValue: rows[0], newValue: data, note: "edited in admin console",
    });
  });
}

export async function confirmCustomer(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(`select is_assumed from customers where id=$1 and tenant_id=$2 for update`, [id, tenantId]);
    if (!rows[0] || !rows[0].is_assumed) return;
    await c.query(`update customers set is_assumed=false, confirmed_at=now() where id=$1`, [id]);
    await audit(c, tenantId, { table: "customers", rowId: id, action: "confirm", oldValue: { is_assumed: true }, newValue: { is_assumed: false } });
  });
}
