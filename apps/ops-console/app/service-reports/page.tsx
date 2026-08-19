import Link from "next/link";
import { RowLink } from "@/components/RowLink";
import { ListToolbar } from "@/components/ListControls";
import { getTenantId } from "@/lib/tenant";
import { listServiceReports, listCompletedJobsWithoutSR } from "@/lib/domain/servicereports";
import { listTechnicians } from "@/lib/domain/technicians";
import { createServiceReportAction } from "./actions";

export const dynamic = "force-dynamic";

function ReviewPill({ action }: { action: string | null }) {
  const map: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-800", rejected: "bg-red-100 text-red-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${action ? map[action] : "bg-amber-100 text-amber-800"}`}>{action ?? "pending"}</span>;
}

export default async function ServiceReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const [allReports, pending, technicians] = await Promise.all([
    listServiceReports(tenantId), listCompletedJobsWithoutSR(tenantId), listTechnicians(tenantId),
  ]);
  // Search by NUMBER first, then account number, then customer name (§3.2).
  const q = (sp.q ?? "").trim().toLowerCase();
  const reports = q
    ? allReports.filter((r) =>
        (r.report_number ?? "").toLowerCase().includes(q)
        || (r.customer_code ?? "").toLowerCase().includes(q)
        || (r.customer ?? "").toLowerCase().includes(q))
    : allReports;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Service reports</h1>
        <p className="mt-1 text-sm text-neutral-600">Every completed service needs a report before it can be invoiced. Reports are immutable; approval and attachments are recorded separately.</p>
      </div>

      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={reports.length === 0}>
        <summary className="cursor-pointer font-medium">File a report for a completed job <span className="text-neutral-400">({pending.length} awaiting)</span></summary>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No completed jobs are awaiting a report.</p>
        ) : (
          <form action={createServiceReportAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm sm:col-span-2"><span className="text-neutral-600">Completed job</span>
              <select name="job_id" required className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
                <option value="">Select…</option>
                {pending.map((j) => <option key={j.id} value={j.id}>{j.customer ?? "(no customer)"} · {j.scheduled_date ?? "?"}</option>)}
              </select></label>
            <label className="text-sm"><span className="text-neutral-600">Performed by</span>
              <select name="performed_by" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
                <option value="">—</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select></label>
            <label className="text-sm sm:col-span-3"><span className="text-neutral-600">Notes</span>
              <input name="notes" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
            <div className="sm:col-span-3"><button className="w-full rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">File report</button></div>
          </form>
        )}
      </details>

      <ListToolbar basePath="/service-reports" params={sp} placeholder="Report no., account no. or customer" showArchived={false} />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Report #</th><th className="px-3 py-2 font-medium">Account no.</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Performed by</th><th className="px-3 py-2 font-medium">Completed</th>
              <th className="px-3 py-2 font-medium">Attachments</th><th className="px-3 py-2 font-medium">Approval</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {reports.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-neutral-500">No service reports yet.</td></tr>}
            {reports.map((r) => (
              <RowLink key={r.id} href={`/service-reports/${r.id}`}>
                <td className="px-3 py-2 font-mono text-xs font-medium text-brand">{r.report_number ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-neutral-700">{r.customer_code ?? "—"}</td>
                <td className="px-3 py-2">{r.customer ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{r.performer ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{r.server_completed_at?.slice(0, 10) ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{r.attachment_count}</td>
                <td className="px-3 py-2"><ReviewPill action={r.review_action} /></td>
              </RowLink>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
