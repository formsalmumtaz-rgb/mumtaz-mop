import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { getPipeline } from "@/lib/domain/pipeline";

export const dynamic = "force-dynamic";
const money = (n: number, ccy: string) => `${ccy} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (n: number | null) => (n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%");

function Stage({ title, href, count, children }: { title: string; href: string; count: number; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <Link href={href} className="text-sm font-medium text-brand underline">{title}</Link>
        <span className="text-2xl font-semibold">{count}</span>
      </div>
      {children && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">{children}</div>}
    </div>
  );
}

export default async function PipelinePage() {
  const tenantId = await getTenantId();
  const p = await getPipeline(tenantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sales pipeline</h1>
        <p className="mt-1 text-sm text-neutral-600">Survey → estimate → quotation → contract. Counts and values straight from the records (deterministic).</p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Stage title="Surveys" href="/surveys" count={p.surveys.total}>
          <span>{p.surveys.draft} draft</span><span>{p.surveys.completed} completed</span>
          <span>{p.surveys.converted} → estimate</span>
        </Stage>
        <Stage title="Estimates" href="/estimates" count={p.estimates.total}>
          <span>{p.estimates.draft} draft</span><span>{p.estimates.quoted} quoted</span>
          <span>{p.estimates.accepted} accepted</span><span>{p.estimates.rejected} rejected</span>
        </Stage>
        <Stage title="Contracts" href="/contracts" count={p.contracts.total}>
          <span>{p.contracts.draft} draft</span><span>{p.contracts.active} active</span>
          <span>{p.estimates.with_contract} from estimates</span>
        </Stage>
      </div>

      {/* Conversion rates */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Survey → estimate", pct(p.conv.surveyToEstimate)],
          ["Estimate → accepted", pct(p.conv.estimateToAccepted)],
          ["Accepted → contract", pct(p.conv.acceptedToContract)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{l}</div>
            <div className="mt-1 text-xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      {/* Pipeline value */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Open pipeline value</div>
          <div className="mt-1 text-2xl font-semibold">{money(p.estimates.revenue_open, p.currency)}</div>
          <div className="mt-1 text-xs text-neutral-500">Revenue of draft + quoted estimates (not yet won/lost).</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Accepted value</div>
          <div className="mt-1 text-2xl font-semibold">{money(p.estimates.revenue_accepted, p.currency)}</div>
          <div className="mt-1 text-xs text-neutral-500">Revenue of accepted estimates.</div>
        </div>
      </div>
      <p className="text-xs text-neutral-500">Estimate revenue is the indicative quote total (before VAT); it becomes the contract value on conversion.</p>
    </div>
  );
}
