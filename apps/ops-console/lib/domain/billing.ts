import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";
import { runContractBilling } from "@mop/worker";

// Recurring billing management (reads the contract schedule + generated invoices;
// manual ops delegate to the same deterministic in-DB engine as the worker).

export interface DueContract {
  id: string; contract_number: string | null; customer: string | null;
  billing_frequency: string | null; next_invoice_date: string | null; last_invoice_date: string | null;
  amount: number;
}

const dueQuery = (clause: string) => `
  select c.id, c.contract_number, cu.trade_name as customer, c.billing_frequency,
         c.next_invoice_date::text, c.last_invoice_date::text,
         coalesce((select sum(coalesce(cs.unit_price,0)*cs.quantity) from contract_services cs where cs.contract_id=c.id and cs.is_active), c.contract_value, 0)::float8 as amount
    from contracts c left join customers cu on cu.id = c.customer_id
   where c.tenant_id = $1 and c.lifecycle_status='active' and coalesce(c.auto_generate_invoice,false)
     and c.billing_frequency is not null and c.billing_frequency <> 'per_visit'
     and c.next_invoice_date is not null and ${clause}
   order by c.next_invoice_date`;

export interface RecentInvoice { id: string; invoice_number: string | null; customer: string | null; billing_period: string | null; total: number; status: string; }
export interface BillingFailure { id: string; contract_id: string | null; period: string | null; error_text: string | null; created_at: string; }

export interface BillingDashboard {
  dueToday: DueContract[]; dueThisWeek: DueContract[]; overdue: DueContract[]; upcoming: DueContract[];
  recent: RecentInvoice[]; failures: BillingFailure[];
}

export async function getBillingDashboard(tenantId: string): Promise<BillingDashboard> {
  const [today, week, overdue, upcoming, recent, failures] = await Promise.all([
    scopedRead(tenantId, dueQuery("c.next_invoice_date = current_date"), [tenantId]),
    scopedRead(tenantId, dueQuery("c.next_invoice_date > current_date and c.next_invoice_date <= current_date + 7"), [tenantId]),
    scopedRead(tenantId, dueQuery("c.next_invoice_date < current_date"), [tenantId]),
    scopedRead(tenantId, dueQuery("c.next_invoice_date > current_date + 7 and c.next_invoice_date <= current_date + 60"), [tenantId]),
    scopedRead(tenantId, 
      `select i.id, i.invoice_number, cu.trade_name as customer, i.billing_period::text, i.total::float8, i.status
         from invoices i left join customers cu on cu.id = i.customer_id
        where i.tenant_id=$1 and i.billing_period is not null
        order by i.created_at desc limit 15`, [tenantId]),
    scopedRead(tenantId, 
      `select f.id, f.contract_id, f.period::text, f.error_text, f.created_at::text
         from billing_failures f where f.tenant_id=$1 order by f.created_at desc limit 15`, [tenantId]),
  ]);
  return {
    dueToday: today.rows, dueThisWeek: week.rows, overdue: overdue.rows, upcoming: upcoming.rows,
    recent: recent.rows as RecentInvoice[], failures: failures.rows as BillingFailure[],
  };
}

export interface PreviewRow { contract_id: string; contract_number: string | null; customer: string | null; billing_frequency: string; next_invoice_date: string; already_billed_to: string | null; }
export async function previewUpcoming(tenantId: string, horizonDays = 30): Promise<PreviewRow[]> {
  const { rows } = await scopedRead(tenantId, 
    `select contract_id, contract_number, customer, billing_frequency, next_invoice_date::text, already_billed_to::text
       from fn_preview_contract_billing($1, current_date + $2::int)`,
    [tenantId, horizonDays],
  );
  return rows as PreviewRow[];
}

// Configure a contract's recurring billing.
export async function setContractBilling(
  tenantId: string, contractId: string,
  d: { billing_frequency?: string; billing_day?: string; billing_interval_days?: string; auto_generate_invoice?: boolean; next_invoice_date?: string },
): Promise<void> {
  const numOrNull = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : Number(t); };
  const freq = (d.billing_frequency ?? "").trim() || null;
  await withTenantTx(tenantId, async (c) => {
    await c.query(
      `update contracts set billing_frequency=$1, billing_day=$2, billing_interval_days=$3,
              auto_generate_invoice=$4,
              next_invoice_date = coalesce($5::date, next_invoice_date, start_date, current_date)
        where id=$6 and tenant_id=$7`,
      [freq, numOrNull(d.billing_day), numOrNull(d.billing_interval_days), !!d.auto_generate_invoice,
       (d.next_invoice_date ?? "").trim() || null, contractId, tenantId],
    );
    await audit(c, tenantId, { table: "contracts", rowId: contractId, action: "update", newValue: d, note: "recurring billing configured" });
  });
}

// Generate Invoice Now — bill the contract's current next period immediately, then advance.
export async function generateInvoiceNow(tenantId: string, contractId: string): Promise<string | null> {
  return withTenantTx(tenantId, async (c) => {
    const ct = (await c.query(`select next_invoice_date, billing_frequency, billing_interval_days, billing_day from contracts where id=$1 and tenant_id=$2`, [contractId, tenantId])).rows[0];
    if (!ct?.next_invoice_date) throw new Error("Contract has no scheduled billing date");
    const inv = (await c.query(`select fn_generate_contract_invoice($1,$2::date) as id`, [contractId, ct.next_invoice_date])).rows[0];
    await c.query(
      `update contracts set last_invoice_date=$2::date,
              next_invoice_date = fn_advance_billing_date($2::date, billing_frequency, billing_interval_days, billing_day)
        where id=$1 and tenant_id=$3`,
      [contractId, ct.next_invoice_date, tenantId],
    );
    if (inv.id) await audit(c, tenantId, { table: "invoices", rowId: inv.id, action: "insert", newValue: { contract_id: contractId, period: ct.next_invoice_date }, note: "invoice generated manually" });
    return inv.id ?? null;
  });
}

// Regenerate Missed Billing — deterministic catch-up for the whole tenant.
export async function regenerateMissed(tenantId: string): Promise<number> {
  return withTenantTx(tenantId, async (c) => {
    const n = await runContractBilling(c as never, tenantId);
    await audit(c, tenantId, { table: "contracts", rowId: tenantId, action: "update", newValue: { generated: n }, note: "regenerate missed billing run" });
    return n;
  });
}
