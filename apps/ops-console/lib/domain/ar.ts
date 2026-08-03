import "server-only";
import { pool } from "../db";

// Accounts Receivable & ageing — read-only over invoice_ar (mig 035/036).
// Deterministic; monitoring only (warnings, never blocks).

export const AGING_BUCKETS = ["current", "1-30", "31-60", "61-90", "91-120", "120+"] as const;

export interface ArSummary {
  outstanding: number;
  overdue: number;
  buckets: Record<string, number>;
  currency: string;
}

export async function getArSummary(tenantId: string): Promise<ArSummary> {
  const { rows } = await pool.query(
    `select coalesce(sum(balance),0)::float8 as outstanding,
            coalesce(sum(balance) filter (where days_overdue > 0),0)::float8 as overdue,
            aging_bucket, coalesce(sum(balance),0)::float8 as bucket_total
       from invoice_ar where tenant_id=$1 and balance > 0
      group by rollup (aging_bucket)`,
    [tenantId],
  );
  const buckets: Record<string, number> = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0]));
  let outstanding = 0, overdue = 0;
  for (const r of rows) {
    if (r.aging_bucket === null) { outstanding = r.outstanding; overdue = r.overdue; }
    else if (r.aging_bucket in buckets) buckets[r.aging_bucket] = r.bucket_total;
  }
  return { outstanding, overdue, buckets, currency: "AED" };
}

export interface CustomerAgingRow {
  customer_id: string; customer: string | null; total: number; overdue: number;
  buckets: Record<string, number>;
}

export async function getCustomerAging(tenantId: string): Promise<CustomerAgingRow[]> {
  const { rows } = await pool.query(
    `select ar.customer_id, cu.trade_name as customer,
            coalesce(sum(ar.balance),0)::float8 as total,
            coalesce(sum(ar.balance) filter (where ar.days_overdue > 0),0)::float8 as overdue,
            coalesce(sum(ar.balance) filter (where ar.aging_bucket='current'),0)::float8 as b_current,
            coalesce(sum(ar.balance) filter (where ar.aging_bucket='1-30'),0)::float8 as b_1_30,
            coalesce(sum(ar.balance) filter (where ar.aging_bucket='31-60'),0)::float8 as b_31_60,
            coalesce(sum(ar.balance) filter (where ar.aging_bucket='61-90'),0)::float8 as b_61_90,
            coalesce(sum(ar.balance) filter (where ar.aging_bucket='91-120'),0)::float8 as b_91_120,
            coalesce(sum(ar.balance) filter (where ar.aging_bucket='120+'),0)::float8 as b_120p
       from invoice_ar ar
       left join customers cu on cu.id = ar.customer_id
      where ar.tenant_id=$1 and ar.balance > 0
      group by ar.customer_id, cu.trade_name
      having sum(ar.balance) > 0
      order by sum(ar.balance) desc`,
    [tenantId],
  );
  return rows.map((r) => ({
    customer_id: r.customer_id, customer: r.customer, total: r.total, overdue: r.overdue,
    buckets: { current: r.b_current, "1-30": r.b_1_30, "31-60": r.b_31_60, "61-90": r.b_61_90, "91-120": r.b_91_120, "120+": r.b_120p },
  }));
}

export interface OpenInvoiceRow {
  invoice_id: string; invoice_number: string | null; customer: string | null; issue_date: string | null;
  due_date: string | null; total: number; balance: number; days_overdue: number; aging_bucket: string; payment_status: string;
}

export async function listOutstandingInvoices(tenantId: string): Promise<OpenInvoiceRow[]> {
  const { rows } = await pool.query(
    `select ar.invoice_id, ar.invoice_number, cu.trade_name as customer, ar.issue_date::text, ar.due_date::text,
            ar.total::float8, ar.balance::float8, ar.days_overdue, ar.aging_bucket, ar.payment_status
       from invoice_ar ar left join customers cu on cu.id = ar.customer_id
      where ar.tenant_id=$1 and ar.balance > 0
      order by ar.days_overdue desc, ar.balance desc`,
    [tenantId],
  );
  return rows as OpenInvoiceRow[];
}
