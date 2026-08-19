import "server-only";
import { scopedRead } from "../rls";

// §3.11 — the figures an accountant needs for a UAE corporate tax return,
// arranged from what the ledger already holds.
//
// It computes NOTHING that is a tax judgement. It does not decide deductibility,
// does not apply relief, and does not produce a liability to file. It reports
// revenue, expenses by category, and what each rate/threshold WOULD imply if the
// stated basis is correct — with every one of those inputs flagged as unconfirmed.
export interface TaxBasis {
  from: string; to: string;
  revenue: number; expenses: number; profit_before_tax: number;
  by_category: { category: string; amount: number; ct_deductible: boolean | null; ct_note: string | null }[];
  undecided_expense_total: number;
  settings: { key: string; value: string; assumed: boolean; description: string | null }[];
  indicative: { threshold: number; rate: number; taxable_above_threshold: number; indicative_tax: number } | null;
  small_business_relief_may_apply: boolean | null;
}

export async function taxBasis(tenantId: string, from: string, to: string): Promise<TaxBasis> {
  const [rev, exp, cats, cfg] = await Promise.all([
    // revenue as the GL sees it, not as invoices claim
    scopedRead(tenantId,
      `select coalesce(sum(jl.credit - jl.debit), 0)::float8 as n
         from journal_lines jl
         join journal_entries je on je.id = jl.journal_entry_id
         join accounts a on a.id = jl.account_id
        where je.tenant_id = $1 and a.account_type = 'income'
          and je.entry_date between $2::date and $3::date`, [tenantId, from, to]).then((r) => Number(r.rows[0].n)),
    scopedRead(tenantId,
      `select coalesce(sum(jl.debit - jl.credit), 0)::float8 as n
         from journal_lines jl
         join journal_entries je on je.id = jl.journal_entry_id
         join accounts a on a.id = jl.account_id
        where je.tenant_id = $1 and a.account_type = 'expense'
          and je.entry_date between $2::date and $3::date`, [tenantId, from, to]).then((r) => Number(r.rows[0].n)),
    scopedRead(tenantId,
      `select ec.name as category, ec.ct_deductible, ec.ct_note,
              coalesce(sum(e.amount), 0)::float8 as amount
         from expense_categories ec
         left join expenses e on e.category_id = ec.id and e.tenant_id = ec.tenant_id
              and e.expense_date between $2::date and $3::date
        where ec.tenant_id = $1
        group by ec.name, ec.ct_deductible, ec.ct_note
        having coalesce(sum(e.amount), 0) > 0
        order by 4 desc`, [tenantId, from, to]).then((r) => r.rows),
    scopedRead(tenantId,
      `select key, (value #>> '{}') as value, is_assumed as assumed, description
         from settings where tenant_id = $1 and service_line_id is null and key like 'tax.%'
        order by key`, [tenantId]).then((r) => r.rows),
  ]);

  const get = (k: string) => cfg.find((c: { key: string }) => c.key === k)?.value;
  const rate = Number(get("tax.ct_rate_standard") ?? NaN);
  const threshold = Number(get("tax.ct_threshold_aed") ?? NaN);
  const sbrLimit = Number(get("tax.small_business_relief_revenue_aed") ?? NaN);
  const profit = rev - exp;

  return {
    from, to, revenue: rev, expenses: exp, profit_before_tax: profit,
    by_category: cats as never,
    undecided_expense_total: (cats as { ct_deductible: boolean | null; amount: number }[])
      .filter((c) => c.ct_deductible === null).reduce((s, c) => s + Number(c.amount), 0),
    settings: cfg as never,
    indicative: Number.isFinite(rate) && Number.isFinite(threshold)
      ? { threshold, rate,
          taxable_above_threshold: Math.max(0, profit - threshold),
          indicative_tax: +(Math.max(0, profit - threshold) * (rate / 100)).toFixed(2) }
      : null,
    // "may" is doing real work here: eligibility has conditions the platform
    // cannot see, so this only ever says the revenue test is or is not met.
    small_business_relief_may_apply: Number.isFinite(sbrLimit) ? rev <= sbrLimit : null,
  };
}
