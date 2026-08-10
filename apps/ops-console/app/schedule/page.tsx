import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listScheduleJobs, listPlannedVisits, type JobRow, type PlannedVisit } from "@/lib/domain/jobs";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "neutral" | "brand" | "navy" | "success" | "warning" | "danger"> = {
  scheduled: "neutral", assigned: "navy", en_route: "navy", arrived: "navy",
  in_progress: "warning", completed: "success", failed: "danger", cancelled: "danger",
};
const fmt = (s: string) => s.replace(/_/g, " ");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayLabel = (s: string) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const today = new Date();
  const from = sp.from ?? iso(new Date(today.getTime() - 7 * 864e5));
  const to = sp.to ?? iso(new Date(today.getTime() + 30 * 864e5));
  const todayStr = iso(today);
  const tenantId = await getTenantId();
  const [jobs, planned] = await Promise.all([
    listScheduleJobs(tenantId, from, to),
    listPlannedVisits(tenantId, from, to),
  ]);

  // Group both streams by date.
  const byDate = new Map<string, { jobs: JobRow[]; planned: PlannedVisit[] }>();
  for (const j of jobs) {
    const d = j.scheduled_date!; if (!byDate.has(d)) byDate.set(d, { jobs: [], planned: [] });
    byDate.get(d)!.jobs.push(j);
  }
  for (const p of planned) {
    const d = p.scheduled_date; if (!byDate.has(d)) byDate.set(d, { jobs: [], planned: [] });
    byDate.get(d)!.planned.push(p);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Schedule"
        description={`Jobs and planned contract visits, ${dayLabel(from)} → ${dayLabel(to)}. Jobs are actual work; planned visits are the forward pipeline from active contracts.`}
        actions={<Link href="/jobs" className="text-sm text-brand underline">Jobs list →</Link>}
      />

      {dates.length === 0 && (
        <Card><CardBody><p className="text-center text-neutral-500">No jobs or planned visits in this window.</p></CardBody></Card>
      )}

      <div className="space-y-4">
        {dates.map((d) => {
          const { jobs: dj, planned: dp } = byDate.get(d)!;
          const isToday = d === todayStr;
          const isPast = d < todayStr;
          return (
            <Card key={d}>
              <div className={`flex items-center justify-between border-b border-neutral-100 px-4 py-2.5 ${isToday ? "bg-brand/5" : ""}`}>
                <div className="font-medium">
                  {dayLabel(d)}
                  {isToday && <Badge tone="brand" className="ml-2">Today</Badge>}
                  {isPast && <Badge tone="warning" className="ml-2">Past</Badge>}
                </div>
                <div className="text-xs text-neutral-500">{dj.length} job(s){dp.length > 0 && ` · ${dp.length} planned`}</div>
              </div>
              <CardBody className="space-y-1.5 p-0 sm:p-0">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-neutral-100">
                    {dj.map((j) => (
                      <tr key={j.id}>
                        <td className="px-4 py-2">
                          <span className="font-medium">{j.customer ?? "—"}</span>
                          {j.branch && <span className="text-xs text-neutral-500"> · {j.branch}</span>}
                        </td>
                        <td className="px-4 py-2 text-neutral-600">{j.service_line ?? "—"}{j.job_type ? ` · ${j.job_type}` : ""}</td>
                        <td className="px-4 py-2 text-neutral-600">{j.technicians ?? j.team ?? "—"}</td>
                        <td className="px-4 py-2 text-right"><Badge tone={STATUS_TONE[j.status] ?? "neutral"}><span className="capitalize">{fmt(j.status)}</span></Badge></td>
                      </tr>
                    ))}
                    {dp.map((p) => (
                      <tr key={p.id} className="opacity-70">
                        <td className="px-4 py-2">
                          <span className="font-medium">{p.customer ?? "—"}</span>
                          {p.branch && <span className="text-xs text-neutral-500"> · {p.branch}</span>}
                        </td>
                        <td className="px-4 py-2 text-neutral-600">{p.contract_number ?? "contract"}{p.visit_seq ? ` · visit ${p.visit_seq}` : ""}</td>
                        <td className="px-4 py-2 text-neutral-500">—</td>
                        <td className="px-4 py-2 text-right"><Badge tone="neutral">planned</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
