import { getTenantId } from "@/lib/tenant";
import { getDashboard } from "@/lib/domain/dashboard";

export const dynamic = "force-dynamic";

function money(n: number, ccy: string) {
  return `${ccy} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const tenantId = await getTenantId();
  const d = await getDashboard(tenantId);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="mt-1 text-sm text-neutral-600">Live — refreshes on load.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Tile label="Jobs today" value={String(d.jobsToday)} sub={`${d.scheduled} scheduled ahead`} />
        <Tile label="Completed today" value={String(d.completedToday)} sub={`${d.completedTotal} all-time`} />
        <Tile label="Revenue (queued)" value={money(d.revenueQueued, d.currency)} sub={`${d.activeContracts} active contracts`} />
        <Tile label="Outstanding" value={money(d.outstanding, d.currency)} sub="unpaid invoices" />
      </div>
      <p className="text-xs text-neutral-500">
        Figures come straight from the ledger and job records — nothing is retyped (Art. III).
      </p>
    </div>
  );
}
