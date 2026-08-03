import "server-only";
import { pool } from "../db";

// Financial statements — read-only over the double-entry GL (journal_entries /
// journal_lines / accounts). Deterministic. Because every entry is balanced,
// the trial balance and balance sheet balance by construction.

export interface TrialBalanceRow { code: string; name: string; account_type: string; debit: number; credit: number; }
export interface TrialBalance { rows: TrialBalanceRow[]; total_debit: number; total_credit: number; as_of: string | null; }

export async function getTrialBalance(tenantId: string, asOf?: string): Promise<TrialBalance> {
  const { rows } = await pool.query(
    `select a.code, a.name, a.account_type,
            coalesce(sum(jl.debit),0)::float8 as debit, coalesce(sum(jl.credit),0)::float8 as credit
       from accounts a
       left join journal_lines jl on jl.account_id = a.id
       left join journal_entries je on je.id = jl.journal_entry_id and ($2::date is null or je.entry_date <= $2::date)
      where a.tenant_id = $1
      group by a.code, a.name, a.account_type
      having coalesce(sum(jl.debit),0) <> 0 or coalesce(sum(jl.credit),0) <> 0
      order by a.code`,
    [tenantId, asOf ?? null],
  );
  const total_debit = rows.reduce((s, r) => s + r.debit, 0);
  const total_credit = rows.reduce((s, r) => s + r.credit, 0);
  return { rows: rows as TrialBalanceRow[], total_debit, total_credit, as_of: asOf ?? null };
}

export interface GlLine { entry_id: string; entry_date: string; source_type: string | null; memo: string | null; code: string; name: string; debit: number; credit: number; }

export async function getGeneralLedger(tenantId: string, opts: { from?: string; to?: string } = {}): Promise<GlLine[]> {
  const { rows } = await pool.query(
    `select je.id as entry_id, je.entry_date::text, je.source_type, je.memo, a.code, a.name,
            jl.debit::float8, jl.credit::float8
       from journal_entries je
       join journal_lines jl on jl.journal_entry_id = je.id
       join accounts a on a.id = jl.account_id
      where je.tenant_id = $1
        and ($2::date is null or je.entry_date >= $2::date)
        and ($3::date is null or je.entry_date <= $3::date)
      order by je.entry_date desc, je.id, a.code
      limit 500`,
    [tenantId, opts.from ?? null, opts.to ?? null],
  );
  return rows as GlLine[];
}

export interface PlRow { code: string; name: string; amount: number; }
export interface ProfitAndLoss { income: PlRow[]; expense: PlRow[]; total_income: number; total_expense: number; net: number; from: string; to: string; }

export async function getProfitAndLoss(tenantId: string, from: string, to: string): Promise<ProfitAndLoss> {
  const { rows } = await pool.query(
    `select a.code, a.name, a.account_type,
            coalesce(sum(jl.credit - jl.debit),0)::float8 as amount
       from accounts a
       join journal_lines jl on jl.account_id = a.id
       join journal_entries je on je.id = jl.journal_entry_id
      where a.tenant_id = $1 and a.account_type in ('income','expense')
        and je.entry_date >= $2::date and je.entry_date <= $3::date
      group by a.code, a.name, a.account_type
      having coalesce(sum(jl.credit - jl.debit),0) <> 0
      order by a.code`,
    [tenantId, from, to],
  );
  // income is credit-normal (amount as credit-debit is positive); expense is debit-normal (negate)
  const income = rows.filter((r) => r.account_type === "income").map((r) => ({ code: r.code, name: r.name, amount: r.amount }));
  const expense = rows.filter((r) => r.account_type === "expense").map((r) => ({ code: r.code, name: r.name, amount: -r.amount }));
  const total_income = income.reduce((s, r) => s + r.amount, 0);
  const total_expense = expense.reduce((s, r) => s + r.amount, 0);
  return { income, expense, total_income, total_expense, net: total_income - total_expense, from, to };
}

export interface BsRow { code: string; name: string; amount: number; }
export interface BalanceSheet {
  assets: BsRow[]; liabilities: BsRow[]; equity: BsRow[];
  total_assets: number; total_liabilities: number; total_equity: number; retained_earnings: number;
  liabilities_equity_total: number; as_of: string;
}

export async function getBalanceSheet(tenantId: string, asOf: string): Promise<BalanceSheet> {
  const { rows } = await pool.query(
    `select a.code, a.name, a.account_type,
            coalesce(sum(jl.debit - jl.credit),0)::float8 as dr_minus_cr,
            coalesce(sum(jl.credit - jl.debit),0)::float8 as cr_minus_dr
       from accounts a
       join journal_lines jl on jl.account_id = a.id
       join journal_entries je on je.id = jl.journal_entry_id
      where a.tenant_id = $1 and je.entry_date <= $2::date
      group by a.code, a.name, a.account_type
      having coalesce(sum(jl.debit - jl.credit),0) <> 0`,
    [tenantId, asOf],
  );
  const assets = rows.filter((r) => r.account_type === "asset").map((r) => ({ code: r.code, name: r.name, amount: r.dr_minus_cr }));
  const liabilities = rows.filter((r) => r.account_type === "liability").map((r) => ({ code: r.code, name: r.name, amount: r.cr_minus_dr }));
  const equity = rows.filter((r) => r.account_type === "equity").map((r) => ({ code: r.code, name: r.name, amount: r.cr_minus_dr }));
  const income = rows.filter((r) => r.account_type === "income").reduce((s, r) => s + r.cr_minus_dr, 0);
  const expense = rows.filter((r) => r.account_type === "expense").reduce((s, r) => s + r.dr_minus_cr, 0);
  const retained_earnings = income - expense; // net profit to date, carried into equity
  const total_assets = assets.reduce((s, r) => s + r.amount, 0);
  const total_liabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  const total_equity = equity.reduce((s, r) => s + r.amount, 0);
  return {
    assets, liabilities, equity,
    total_assets, total_liabilities, total_equity, retained_earnings,
    liabilities_equity_total: total_liabilities + total_equity + retained_earnings, as_of: asOf,
  };
}

export interface VatSummary { output_vat: number; taxable_sales: number; from: string; to: string; }

// Output VAT and taxable sales from the GL (VAT-Output account movements net of
// credits, and revenue recognised). Input VAT is not tracked separately yet.
export async function getVatSummary(tenantId: string, from: string, to: string): Promise<VatSummary> {
  const { rows } = await pool.query(
    `select
       coalesce(sum(jl.credit - jl.debit) filter (where a.code = (select value #>> '{}' from settings where tenant_id=$1 and service_line_id is null and key='gl.account_code.vat_output')),0)::float8 as output_vat,
       coalesce(sum(jl.credit - jl.debit) filter (where a.code = (select value #>> '{}' from settings where tenant_id=$1 and service_line_id is null and key='gl.account_code.revenue')),0)::float8 as taxable_sales
       from journal_lines jl
       join journal_entries je on je.id = jl.journal_entry_id
       join accounts a on a.id = jl.account_id
      where jl.tenant_id = $1 and je.entry_date >= $2::date and je.entry_date <= $3::date`,
    [tenantId, from, to],
  );
  return { output_vat: rows[0]?.output_vat ?? 0, taxable_sales: rows[0]?.taxable_sales ?? 0, from, to };
}

export interface StatementRow { date: string; doc_type: string; reference: string | null; debit: number; credit: number; balance: number; }
export interface CustomerStatement { customer: string | null; rows: StatementRow[]; balance: number; }

// Chronological receivable ledger for one customer. Debit increases what the
// customer owes (invoice, refund); credit decreases it (receipt, credit note).
export async function getCustomerStatement(tenantId: string, customerId: string): Promise<CustomerStatement> {
  const cust = (await pool.query(`select trade_name from customers where id=$1 and tenant_id=$2`, [customerId, tenantId])).rows[0];
  const { rows } = await pool.query(
    `select d, doc_type, reference, debit::float8, credit::float8 from (
       select coalesce(issue_date, created_at::date) d, 'Invoice' doc_type, invoice_number reference, total debit, 0 credit
         from invoices where tenant_id=$1 and customer_id=$2 and document_type='tax_invoice' and status in ('issued','paid')
       union all
       select receipt_date, 'Receipt', receipt_number, 0, amount from receipts where tenant_id=$1 and customer_id=$2
       union all
       select coalesce(issue_date, created_at::date), 'Credit note', credit_note_number, 0, total from credit_notes where tenant_id=$1 and customer_id=$2 and status='issued'
       union all
       select refund_date, 'Refund', refund_number, amount, 0 from refunds where tenant_id=$1 and customer_id=$2
     ) x order by d, doc_type`,
    [tenantId, customerId],
  );
  let bal = 0;
  const out: StatementRow[] = rows.map((r) => { bal += r.debit - r.credit; return { date: r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10), doc_type: r.doc_type, reference: r.reference, debit: r.debit, credit: r.credit, balance: bal }; });
  return { customer: cust?.trade_name ?? null, rows: out, balance: bal };
}

export interface RevenueRow { key: string; label: string; revenue: number; }

export async function getRevenueByMonth(tenantId: string): Promise<RevenueRow[]> {
  const { rows } = await pool.query(
    `select period, sum(rev)::float8 revenue from (
       select to_char(issue_date,'YYYY-MM') period, subtotal rev from invoices where tenant_id=$1 and document_type='tax_invoice' and status in ('issued','paid') and issue_date is not null
       union all
       select to_char(issue_date,'YYYY-MM'), -subtotal from credit_notes where tenant_id=$1 and status='issued' and issue_date is not null
     ) x group by period order by period desc`,
    [tenantId],
  );
  return rows.map((r) => ({ key: r.period, label: r.period, revenue: r.revenue }));
}

export async function getRevenueByCustomer(tenantId: string): Promise<RevenueRow[]> {
  const { rows } = await pool.query(
    `select customer_id, coalesce(customer,'(unknown)') label, sum(rev)::float8 revenue from (
       select i.customer_id, cu.trade_name customer, i.subtotal rev
         from invoices i left join customers cu on cu.id=i.customer_id
        where i.tenant_id=$1 and i.document_type='tax_invoice' and i.status in ('issued','paid')
       union all
       select cn.customer_id, cu.trade_name, -cn.subtotal
         from credit_notes cn left join customers cu on cu.id=cn.customer_id
        where cn.tenant_id=$1 and cn.status='issued'
     ) x group by customer_id, customer having sum(rev) <> 0 order by sum(rev) desc`,
    [tenantId],
  );
  return rows.map((r) => ({ key: r.customer_id, label: r.label, revenue: r.revenue }));
}
