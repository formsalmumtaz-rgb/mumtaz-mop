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
  return href ? <Link href={href} className={`${cls} lift hover:border-brand hover:bg-brand/5`}>{body}</Link> : <div className={cls}>{body}</div>;
}

// The front door (UI refresh 13): one satisfying tile per daily action, icon
// first, brand-red on hover, physical lift. These are the six things the office
// does all day — never more than one tap from login.
const QUICK_ACTIONS: { href: string; label: string; icon: string }[] = [
  { href: "/customers", label: "New customer", icon: "M12 5v14M5 12h14" },
  { href: "/surveys", label: "New survey", icon: "M9 3h6v4H9zM5 7v14h14V7M9 13l2 2 4-4" },
  { href: "/estimates", label: "New estimate", icon: "M7 3h10v18H7zM10 8h4M10 12h4" },
  { href: "/jobs/new", label: "New job", icon: "M9 6V4h6v2m-9 3h12v10H6zM3 9h18" },
  { href: "/invoices", label: "Raise invoice", icon: "M6 3h9l4 4v14H6zM9 12h6M9 16h4" },
  { href: "/receipts", label: "Record payment", icon: "M4 7h16v10H4zM12 10a2 2 0 100 4 2 2 0 000-4" },
  { href: "/stock", label: "Issue stock", icon: "M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9" },
];

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

      {/* Quick actions — the product's front door (UI refresh 13) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {QUICK_ACTIONS.map((a) => (
          <Link key={a.href + a.label} href={a.href}
                className="lift group flex flex-col items-center gap-1.5 rounded-xl border border-brand/25 bg-white px-3 py-4 text-center text-sm font-medium text-brand hover:border-brand hover:bg-brand/5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                 strokeLinecap="round" strokeLinejoin="round" className="opacity-70 transition-transform duration-150 group-hover:scale-110 group-hover:opacity-100">
              <path d={a.icon} />
            </svg>
            {a.label}
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
