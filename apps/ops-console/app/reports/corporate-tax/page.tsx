import { getTenantId } from "@/lib/tenant";
import { requireView } from "@/lib/auth";
import { taxBasis } from "@/lib/domain/tax";
import { PageHeader, TableWrap, Thead, Tbody, StatusPill } from "@/components/ui";

// §3.11 — corporate tax, basic. Figures for the accountant, never a return.
export const dynamic = "force-dynamic";
const aed = (n: number) => "AED " + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const yearStart = () => `${new Date().getUTCFullYear()}-01-01`;
const today = () => new Date().toISOString().slice(0, 10);

export default async function CorporateTaxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireView("settings.manage");
  const tenantId = await getTenantId();
  const from = sp.from ?? yearStart(), to = sp.to ?? today();
  const b = await taxBasis(tenantId, from, to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Corporate tax — working figures"
        description={`${from} to ${to}. Figures for your accountant, arranged from the ledger.`}
      />

      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
        <h2 className="font-medium text-amber-900">This is not a tax return, and it must not be filed from.</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
          <li>Every rate and threshold below is <strong>unconfirmed</strong> — seeded from published UAE
              instruments, not verified against current law. Tax rules change.</li>
          <li>The platform makes <strong>no judgement about deductibility</strong>. Where your accountant has not
              said, the amount is reported as undecided rather than guessed either way.</li>
          <li>Small Business Relief has conditions this system cannot see. It only tells you whether the
              <em> revenue test</em> is met.</li>
          <li><strong>Filing stays with your tax adviser.</strong></li>
        </ul>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card-lift rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Revenue (from the ledger)</div>
          <div className="mt-1 text-2xl font-semibold">{aed(b.revenue)}</div>
        </div>
        <div className="card-lift rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Expenses</div>
          <div className="mt-1 text-2xl font-semibold">{aed(b.expenses)}</div>
        </div>
        <div className="card-lift rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Profit before tax</div>
          <div className="mt-1 text-2xl font-semibold">{aed(b.profit_before_tax)}</div>
        </div>
      </section>

      {b.indicative && (
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="font-medium">What the stated basis would imply</h2>
          <p className="mt-1 text-sm text-neutral-600">
            If — and only if — the rate and threshold below are correct and everything is deductible as recorded.
            Your accountant decides whether any of that holds.
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-neutral-500">Threshold (0% up to)</dt><dd>{aed(b.indicative.threshold)}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-500">Amount above the threshold</dt><dd>{aed(b.indicative.taxable_above_threshold)}</dd></div>
            <div className="flex justify-between font-medium"><dt>Indicative at {b.indicative.rate}%</dt><dd>{aed(b.indicative.indicative_tax)}</dd></div>
          </dl>
          {b.small_business_relief_may_apply !== null && (
            <p className="mt-3 text-sm">
              Small Business Relief revenue test:{" "}
              {b.small_business_relief_may_apply
                ? <StatusPill tone="info">revenue is within the limit — ask your adviser whether the relief applies</StatusPill>
                : <StatusPill tone="warn">revenue is above the limit</StatusPill>}
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Expenses by category</h2>
        {b.undecided_expense_total > 0 && (
          <p className="text-sm text-amber-800">
            {aed(b.undecided_expense_total)} sits in categories nobody has marked deductible or not.
            Ask your accountant once and record it, and every future period is consistent.
          </p>
        )}
        <TableWrap minWidth={560}>
          <Thead>
            <tr>
              <th className="px-3 py-2 text-left font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-left font-medium">Deductible?</th>
              <th className="px-3 py-2 text-left font-medium">Accountant&rsquo;s note</th>
            </tr>
          </Thead>
          <Tbody>
            {b.by_category.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-neutral-500">No expenses recorded in this period.</td></tr>
            )}
            {b.by_category.map((c) => (
              <tr key={c.category}>
                <td className="px-3 py-2">{c.category}</td>
                <td className="px-3 py-2 text-right">{aed(Number(c.amount))}</td>
                <td className="px-3 py-2">
                  {c.ct_deductible === true ? <StatusPill tone="ok">yes</StatusPill>
                    : c.ct_deductible === false ? <StatusPill tone="bad">no</StatusPill>
                    : <StatusPill tone="warn">not decided</StatusPill>}
                </td>
                <td className="px-3 py-2 text-neutral-600">{c.ct_note ?? "—"}</td>
              </tr>
            ))}
          </Tbody>
        </TableWrap>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">What these figures rest on</h2>
        <p className="text-sm text-neutral-600">Each is editable in settings. Nothing here was verified against current law by this system.</p>
        {b.settings.map((s) => (
          <div key={s.key} className="rounded border border-neutral-200 bg-white p-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs">{s.key}</span>
              <span className="flex items-center gap-2">
                <strong>{s.value}</strong>
                {s.assumed && <StatusPill tone="warn">unconfirmed</StatusPill>}
              </span>
            </div>
            {s.description && <p className="mt-1 text-xs text-neutral-600">{s.description}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}
