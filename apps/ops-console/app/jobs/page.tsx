import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listJobsPaged, getJobStatusCounts, JOB_STATUSES } from "@/lib/domain/jobs";
import { parseListParams } from "@/lib/list";
import { ListToolbar, Pagination, ExportButtons, DateRangeFilter } from "@/components/ListControls";
import { Badge, TableWrap, Thead, Tbody, PageHeader, ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "neutral" | "brand" | "navy" | "success" | "warning" | "danger"> = {
  scheduled: "neutral", assigned: "navy", en_route: "navy", arrived: "navy",
  in_progress: "warning", completed: "success", failed: "danger", cancelled: "danger",
};
const fmt = (s: string) => s.replace(/_/g, " ");

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lp = parseListParams(sp);
  const status = sp.status && (JOB_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const contractId = (sp.contract ?? "").trim() || undefined; // deep-link from a contract's fan-out summary
  const tenantId = await getTenantId();
  const [{ rows: jobs, total }, counts] = await Promise.all([
    listJobsPaged(tenantId, { q: lp.q, status, from: sp.from, to: sp.to, contractId, limit: lp.pageSize, offset: lp.offset }),
    getJobStatusCounts(tenantId),
  ]);
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  // Preserve q when switching status filter.
  const statusHref = (s?: string) => {
    const p = new URLSearchParams();
    if (lp.q) p.set("q", lp.q);
    if (s) p.set("status", s);
    const qs = p.toString();
    return qs ? `/jobs?${qs}` : "/jobs";
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Jobs"
        description="Every scheduled, in-progress, and completed job across all divisions. Filter by status or search by customer."
        actions={<ButtonLink href="/jobs/new" variant="primary">+ New job</ButtonLink>}
      />

      {contractId && (
        <div className="flex items-center gap-2 rounded border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-brand">
          Showing jobs for one contract.
          <Link href={`/contracts/${contractId}`} className="underline">View contract</Link>
          <Link href="/jobs" className="ml-auto text-neutral-500 underline">Clear filter</Link>
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <Link href={statusHref(undefined)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${!status ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}>
          All <span className="text-neutral-400">({totalAll})</span>
        </Link>
        {JOB_STATUSES.map((s) => (
          <Link key={s} href={statusHref(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${status === s ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}>
            {fmt(s)} <span className="text-neutral-400">({counts[s] ?? 0})</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ListToolbar basePath="/jobs" params={sp} showArchived={false} placeholder="Search by customer…" />
        <DateRangeFilter basePath="/jobs" params={sp} label="Scheduled" />
        <div className="ml-auto"><ExportButtons dataset="jobs" params={sp} /></div>
      </div>

      <TableWrap minWidth={860}>
        <Thead>
          <tr>
            <th className="px-4 py-2.5 font-medium">Date</th>
            <th className="px-4 py-2.5 font-medium">Customer</th>
            <th className="px-4 py-2.5 font-medium">Division</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Team / technicians</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </Thead>
        <Tbody>
          {jobs.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-500">{lp.q || status ? "No jobs match this filter." : "No jobs yet."}</td></tr>
          )}
          {jobs.map((j) => (
            <tr key={j.id} className="hover:bg-neutral-50">
              <td className="px-4 py-2.5 whitespace-nowrap text-neutral-700">{j.scheduled_date ?? "—"}{j.scheduled_start ? ` · ${j.scheduled_start}` : ""}</td>
              <td className="px-4 py-2.5">
                <Link href={`/jobs/${j.id}`} className="font-medium text-brand hover:underline">{j.customer ?? "—"}</Link>
                {j.branch && <div className="text-xs text-neutral-500">{j.branch}</div>}
              </td>
              <td className="px-4 py-2.5 text-neutral-600">
                {j.service_line ?? "—"}
                {j.is_contract ? <span className="ml-1 text-xs text-neutral-400">· contract</span> : <span className="ml-1 text-xs text-neutral-400">· ad-hoc</span>}
              </td>
              <td className="px-4 py-2.5 text-neutral-600">{j.job_type ?? "—"}</td>
              <td className="px-4 py-2.5 text-neutral-600">{j.technicians ?? j.team ?? "—"}</td>
              <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[j.status] ?? "neutral"}><span className="capitalize">{fmt(j.status)}</span></Badge></td>
            </tr>
          ))}
        </Tbody>
      </TableWrap>

      <Pagination basePath="/jobs" params={sp} page={lp.page} pageSize={lp.pageSize} total={total} />
    </div>
  );
}
