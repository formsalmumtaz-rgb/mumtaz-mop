import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getActiveDivision } from "@/lib/domain/reference";
import { getDashboard, getAssumedBacklog, getExpiryAttention, getComplianceAttention } from "@/lib/domain/dashboard";

export const dynamic = "force-dynamic";

function money(n: number, ccy: string) {
  return `${ccy} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function Tile({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </>
  );
  const cls = "block rounded-lg border border-neutral-200 bg-white p-4";
  return href ? <Link href={href} className={`${cls} transition-colors hover:border-brand hover:bg-brand/5`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default async function DashboardPage() {
  const tenantId = await getTenantId();
  const division = await getActiveDivision(tenantId);
  const [d, assumed, expiry, comp] = await Promise.all([getDashboard(tenantId, division.id), getAssumedBacklog(tenantId), getExpiryAttention(tenantId), getComplianceAttention(tenantId)]);
  const attention = d.pendingExpenses > 0 || d.reportsPending > 0 || d.fieldReviewHeld > 0 || assumed.total > 0 || expiry.expiring > 0 || expiry.bounced > 0 || comp.attestationOverdue > 0 || comp.severeActive > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="mt-1 text-sm text-neutral-600">Live — refreshes on load. Operations figures are for the active division; finance is company-wide.</p>
        </div>
        <span className="rounded-full bg-navy px-3 py-1 text-sm font-medium text-white">{division.name}</span>
      </div>

      {/* Quick actions (refresh item 2): the daily workflow one tap from login */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {[["/customers", "＋ Customer"], ["/surveys", "＋ Survey"], ["/estimates", "＋ Estimate"], ["/jobs/new", "＋ Job"],
          ["/invoices", "＋ Invoice"], ["/receipts", "Record payment"], ["/stock", "Issue stock"]].map(([href, label]) => (
          <Link key={href} href={href}
                className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-3 text-center text-sm font-medium text-brand hover:bg-brand/10">
            {label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Jobs today" value={String(d.jobsToday)} sub={`${d.scheduled} scheduled ahead`} href="/jobs?status=scheduled" />
        <Tile label="Completed today" value={String(d.completedToday)} sub={`${d.completedTotal} all-time`} href="/jobs?status=completed" />
        <Tile label="Next 7 days" value={String(d.upcomingWeek)} sub="upcoming jobs" href="/schedule" />
        <Tile label="Active contracts" value={String(d.activeContracts)} sub="billing live" href="/customers" />
        <Tile label="Revenue (queued)" value={money(d.revenueQueued, d.currency)} sub="queued / issued" href="/invoices" />
        <Tile label="Outstanding" value={money(d.outstanding, d.currency)} sub="unpaid invoices" href="/ar" />
      </div>

      {attention && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Needs attention</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {d.pendingExpenses > 0 && (
              <Tile label="Expense claims to approve" value={String(d.pendingExpenses)} sub={money(d.pendingExpenseAmount, d.currency) + " awaiting approval"} href="/expenses?status=submitted" />
            )}
            {d.reportsPending > 0 && (
              <Tile label="Service reports to review" value={String(d.reportsPending)} sub="awaiting approval" href="/service-reports" />
            )}
            {comp.attestationOverdue > 0 && (
              <Tile label="⚠ Attestation OVERDUE" value={String(comp.attestationOverdue)} sub="legal exposure — Unified Contract condition 1" href="/contracts" />
            )}
            {comp.severeActive > 0 && (
              <Tile label="Severe infestation active" value={String(comp.severeActive)} sub="3-day follow-ups, zero revenue — clause 6" href="/contracts" />
            )}
            {expiry.expiring > 0 && (
              <Tile label="Documents expiring ≤90 days" value={String(expiry.expiring)}
                    sub={expiry.nearest ? `nearest ${expiry.nearest}` : undefined} href="/notifications" />
            )}
            {expiry.bounced > 0 && (
              <Tile label="Customers with bounced email" value={String(expiry.bounced)} sub="fix the address — data quality" href="/customers" />
            )}
            {assumed.total > 0 && (
              <Tile label="Assumed values to confirm" value={String(assumed.total)}
                    sub={assumed.tables.map((t) => `${t.tbl.replace(/_/g, " ")} (${t.n})`).join(" · ")}
                    href="/settings/master-data" />
            )}
            {d.fieldReviewHeld > 0 && (
              <Tile label="Field events held for review" value={String(d.fieldReviewHeld)} sub="from a revoked device — approve or reject" href="/field-review" />
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Figures come straight from the ledger and job records — nothing is retyped (Art. III).
      </p>
    </div>
  );
}
