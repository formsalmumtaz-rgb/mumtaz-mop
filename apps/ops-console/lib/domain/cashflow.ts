import "server-only";
import { pool } from "../db";

// Cash Flow + revenue recognition (read-only over the subledger). Two bases:
//  - accrual: revenue recognised when an invoice is ISSUED (ex-VAT subtotal),
//    net of issued credit notes — the recognised-revenue view.
//  - cash: money actually moved — receipts in, refunds out, by their own dates.
// Profitability is a separate report and is never mixed in here (FINANCE §6).

export type Basis = "accrual" | "cash";

export interface CashFlowRow { period: string; inflow: number; outflow: number; net: number; }
export interface CashFlow { basis: Basis; rows: CashFlowRow[]; inflow: number; outflow: number; net: number; currency: string; }

export async function getCashFlow(tenantId: string, basis: Basis): Promise<CashFlow> {
  const sql = basis === "accrual"
    ? `select period, sum(inflow)::float8 inflow, sum(outflow)::float8 outflow from (
         select to_char(issue_date,'YYYY-MM') period, subtotal inflow, 0 outflow
           from invoices where tenant_id=$1 and document_type='tax_invoice' and status in ('issued','paid') and issue_date is not null
         union all
         select to_char(issue_date,'YYYY-MM'), 0, subtotal
           from credit_notes where tenant_id=$1 and status='issued' and issue_date is not null
       ) x group by period order by period`
    : `select period, sum(inflow)::float8 inflow, sum(outflow)::float8 outflow from (
         select to_char(receipt_date,'YYYY-MM') period, amount inflow, 0 outflow from receipts where tenant_id=$1
         union all
         select to_char(refund_date,'YYYY-MM'), 0, amount from refunds where tenant_id=$1
       ) x group by period order by period`;
  const { rows } = await pool.query(sql, [tenantId]);
  const out: CashFlowRow[] = rows.map((r) => ({ period: r.period, inflow: r.inflow, outflow: r.outflow, net: r.inflow - r.outflow }));
  const inflow = out.reduce((s, r) => s + r.inflow, 0);
  const outflow = out.reduce((s, r) => s + r.outflow, 0);
  return { basis, rows: out, inflow, outflow, net: inflow - outflow, currency: "AED" };
}
