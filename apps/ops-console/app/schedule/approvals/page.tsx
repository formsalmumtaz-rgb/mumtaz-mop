import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listPendingApprovals, listDayJobs } from "@/lib/domain/approvals";
import { PageHeader, TableWrap, Thead, Tbody, Badge } from "@/components/ui";
import { approveScheduleAction } from "./actions";

// §3.4 — the next-day and night-schedule approval queue.
//
// Nothing here sends anything. Approving a day is what RELEASES the customer
// 24-hour notices; until then the schedule is the office's business only. That
// ordering is the point: a customer should never be promised a visit the office
// has not yet agreed to.
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const tenantId = await getTenantId();
  const days = await listPendingApprovals(tenantId, 2);
  const detail = await Promise.all(
    days.map(async (d) => ({ day: d, jobs: await listDayJobs(tenantId, d.operating_date, d.shift_id) })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule approval"
        description="Tonight's and tomorrow's schedule, for review before anyone outside the office hears about it. Approving a day is what releases the customers' 24-hour notices."
      />
      <p className="text-sm text-neutral-600">
        Adjust anything first on the <Link href="/schedule" className="text-brand underline">calendar</Link> —
        drag a job to another day — then come back and approve.
      </p>

      {detail.length === 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-neutral-500">
          Nothing scheduled for today or tomorrow. When the schedule generates, it appears here for approval.
        </div>
      )}

      {detail.map(({ day, jobs }) => {
        const approved = !!day.approved_at;
        return (
          <section key={`${day.operating_date}-${day.shift_id ?? "all"}`}
                   className={`rounded-lg border p-5 ${approved ? "border-emerald-300 bg-emerald-50/40" : "border-amber-300 bg-amber-50/40"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-medium">
                {day.operating_date}
                {day.shift_name && <span className="ml-2 text-sm text-neutral-600">{day.shift_name}</span>}
              </h2>
              <div className="flex items-center gap-3 text-sm">
                <span>{day.jobs} job{day.jobs === 1 ? "" : "s"}</span>
                {day.unassigned > 0 && (
                  <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                    {day.unassigned} unassigned
                  </span>
                )}
                {approved ? (
                  <Badge tone="success">approved · {day.notices_sent} notice{day.notices_sent === 1 ? "" : "s"} sent</Badge>
                ) : (
                  <form action={approveScheduleAction}>
                    <input type="hidden" name="operating_date" value={day.operating_date} />
                    <input type="hidden" name="shift_id" value={day.shift_id ?? ""} />
                    <button className="rounded bg-amber-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-800">
                      Approve &amp; notify customers
                    </button>
                  </form>
                )}
              </div>
            </div>
            {day.areas.length > 0 && (
              <p className="mt-1 text-xs text-neutral-600">areas: {day.areas.join(", ")}</p>
            )}

            <div className="mt-3"><TableWrap>
              <table className="w-full min-w-[720px] text-sm">
                <Thead>
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Time</th>
                    <th className="px-3 py-2 text-left font-medium">Account no.</th>
                    <th className="px-3 py-2 text-left font-medium">Customer</th>
                    <th className="px-3 py-2 text-left font-medium">Area</th>
                    <th className="px-3 py-2 text-left font-medium">Team</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </Thead>
                <Tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td className="px-3 py-2 text-neutral-600">{j.start ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-neutral-700">{j.account_no ?? "—"}</td>
                      <td className="px-3 py-2">
                        {j.customer ?? "—"}
                        {j.off_pattern && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            first visit — off-pattern
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-neutral-600">{j.area ?? "—"}</td>
                      <td className="px-3 py-2 text-neutral-600">
                        {j.team ?? <span className="text-amber-700">unassigned</span>}
                      </td>
                      <td className="px-3 py-2 text-neutral-600">{j.status}</td>
                    </tr>
                  ))}
                </Tbody>
              </table>
            </TableWrap></div>
          </section>
        );
      })}
    </div>
  );
}
