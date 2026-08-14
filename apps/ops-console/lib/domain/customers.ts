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
    // Account numbers are permanent and never reused (Art. VII): the next code is
    // max(live codes, import burn floor) + 1 — same rule as the import pipeline.
    // The old count(*)+1 collided with burned import codes once 508 customers
    // landed (unique constraint would have rejected every new customer).
    const { rows: seq } = await c.query(
      `select greatest(
                coalesce(max((substring(code from 'CUST-(\\d+)'))::int), 0),
                coalesce((select (value #>> '{}')::int - 1 from settings
                           where tenant_id = $1 and key = 'import.next_customer_code'), 0)
              ) + 1 as n
         from customers where tenant_id = $1 and code ~ '^CUST-\\d+$'`, [tenantId]);
    const code = "CUST-" + String(seq[0].n).padStart(4, "0");
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

// Release 1 item 3 — the customer profile previously showed no money and no visit
// history. One consolidated activity reader: outstanding balance, recent invoices,
// recent receipts, visit history (jobs + their service reports). Pure joins of data
// already in the DB, via scopedRead (RLS live).
export interface CustomerActivity {
  outstanding: number;
  invoices: { id: string; invoice_number: string | null; status: string; issue_date: string | null; total: number; open_amount: number }[];
  receipts: { id: string; receipt_number: string | null; receipt_date: string | null; method: string | null; amount: number; reversed: boolean }[];
  visits: { id: string; scheduled_date: string | null; status: string; service_type: string | null; branch: string | null;
            report_id: string | null; report_number: string | null; report_approved: string | null }[];
}

export async function getCustomerActivity(tenantId: string, customerId: string): Promise<CustomerActivity> {
  const [inv, rcp, vis] = await Promise.all([
    // invoice_ar is the authoritative AR view (mig 035/042): balance nets non-reversed
    // receipt allocations; payment_status/days_overdue come with it.
    scopedRead(tenantId,
      `select ar.invoice_id as id, ar.invoice_number, ar.status, ar.issue_date::text as issue_date,
              ar.total::numeric as total, ar.balance::numeric as open_amount
         from invoice_ar ar
        where ar.tenant_id = $1 and ar.customer_id = $2 and ar.status <> 'cancelled'
        order by ar.issue_date desc nulls last, ar.invoice_id desc limit 12`,
      [tenantId, customerId]),
    scopedRead(tenantId,
      `select r.id, r.receipt_number, r.receipt_date::text as receipt_date, r.method,
              r.amount::numeric as amount,
              exists (select 1 from receipt_reversals rr where rr.receipt_id = r.id) as reversed
         from receipts r
        where r.tenant_id = $1 and r.customer_id = $2
        order by r.receipt_date desc nulls last, r.created_at desc limit 12`,
      [tenantId, customerId]),
    scopedRead(tenantId,
      `select j.id, j.scheduled_date::text as scheduled_date, j.status,
              st.name as service_type, b.name as branch,
              sr.id as report_id, sr.report_number,
              (select rv.action from service_report_reviews rv
                where rv.service_report_id = sr.id order by rv.created_at desc limit 1) as report_approved
         from jobs j
         left join service_types st on st.id = j.service_type_id
         left join customer_branches b on b.id = j.branch_id
         left join service_reports sr on sr.job_id = j.id
        where j.tenant_id = $1 and j.customer_id = $2
        order by j.scheduled_date desc nulls last, j.created_at desc limit 25`,
      [tenantId, customerId]),
  ]);
  const outstanding = (inv.rows as { open_amount: string; status: string }[])
    .filter((r) => r.status === "issued")
    .reduce((s, r) => s + Number(r.open_amount), 0);
  return {
    outstanding,
    invoices: inv.rows.map((r: Record<string, unknown>) => ({ ...r, total: Number(r.total), open_amount: Number(r.open_amount) })) as CustomerActivity["invoices"],
    receipts: rcp.rows.map((r: Record<string, unknown>) => ({ ...r, amount: Number(r.amount) })) as CustomerActivity["receipts"],
    visits: vis.rows as CustomerActivity["visits"],
  };
}

// Flow items 6+7 — shared by the survey and estimate creation flows.
// Inline "new customer" creates a REAL customer through the exact same path as
// the full form (same code sequence, same audit), and reports what it made so
// the screen can say so. The default site is inherited automatically: if the
// customer has exactly one active branch, that is the site — never re-asked.
export interface ResolvedCustomer { id: string; created: boolean; code: string | null; name: string | null }

export async function resolveOrCreateInlineCustomer(
  tenantId: string, serviceLineId: string, fd: FormData,
): Promise<ResolvedCustomer> {
  const existing = String(fd.get("customer_id") ?? "").trim();
  if (existing) {
    const { rows } = await scopedRead(tenantId,
      `select code, coalesce(trade_name, legal_name) as name from customers where id = $1 and tenant_id = $2`,
      [existing, tenantId]);
    return { id: existing, created: false, code: rows[0]?.code ?? null, name: rows[0]?.name ?? null };
  }
  const name = String(fd.get("new_customer_name") ?? "").trim();
  if (!name) throw new Error("Pick a customer or enter a new customer name");
  const customerId = await createCustomer(tenantId, serviceLineId, {
    trade_name: name,
    customer_type: String(fd.get("new_customer_type") ?? "B2B") || "B2B",
    emirate: String(fd.get("new_customer_emirate") ?? "Sharjah") || "Sharjah",
  } as CustomerInput);
  const phone = String(fd.get("new_customer_phone") ?? "").trim();
  if (phone) {
    const { withRequest } = await import("../rls");
    await withRequest({ tenantId }, (c) =>
      c.query(
        `insert into contacts (tenant_id, service_line_id, customer_id, name, phone, is_primary, is_assumed, assumed_note)
         values ($1,$2,$3,'Primary contact',$4,true,true,'Captured inline at survey/estimate - confirm')`,
        [tenantId, serviceLineId, customerId, phone]));
  }
  const { rows } = await scopedRead(tenantId,
    `select code from customers where id = $1 and tenant_id = $2`, [customerId, tenantId]);
  return { id: customerId, created: true, code: rows[0]?.code ?? null, name };
}

// The customer's default site: their only active branch (most customers have
// exactly one). Ambiguous (0 or 2+) → null, the caller leaves it unset.
export async function defaultBranchId(tenantId: string, customerId: string): Promise<string | null> {
  const { rows } = await scopedRead(tenantId,
    `select id from customer_branches where tenant_id = $1 and customer_id = $2 and is_active limit 2`,
    [tenantId, customerId]);
  return rows.length === 1 ? rows[0].id : null;
}
