import Link from "next/link";

export const dynamic = "force-dynamic";

const REPORTS = [
  ["Trial balance", "/reports/trial-balance", "Every account's debit/credit totals — must balance."],
  ["Profit & loss", "/reports/profit-loss", "Income less expenses over a period."],
  ["Balance sheet", "/reports/balance-sheet", "Assets = liabilities + equity, as of a date."],
  ["General ledger", "/reports/general-ledger", "Every posted journal line, most recent first."],
  ["VAT summary", "/reports/vat", "Output VAT and taxable sales for a period."],
  ["Customer statement", "/reports/customer-statement", "A customer's invoices, receipts, credits and balance."],
  ["Revenue", "/reports/revenue", "Recognised revenue by month and by customer."],
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Financial reports</h1>
        <p className="mt-1 text-sm text-neutral-600">Straight from the double-entry ledger and the revenue subledger — deterministic, nothing retyped.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(([label, href, desc]) => (
          <Link key={href} href={href} className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand hover:bg-brand/5">
            <div className="font-medium text-brand">{label}</div>
            <div className="mt-1 text-sm text-neutral-600">{desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
