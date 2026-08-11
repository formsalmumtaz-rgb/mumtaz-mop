import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listScheduleJobs, listPlannedVisits, detectConflicts, JOB_STATUSES, type JobRow, type PlannedVisit } from "@/lib/domain/jobs";
import { listServiceLines } from "@/lib/domain/reference";
import { Card, CardBody, Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const TONE: Record<string, "neutral" | "brand" | "navy" | "success" | "warning" | "danger"> = {
  scheduled: "neutral", assigned: "navy", en_route: "navy", arrived: "navy",
  in_progress: "warning", completed: "success", failed: "danger", cancelled: "danger",
};
const fmt = (s: string) => s.replace(/_/g, " ");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(new Date(s + "T00:00:00Z").getTime() + n * 864e5));
const dayLabel = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const lines = await listServiceLines(tenantId);

  const view = sp.view === "day" ? "day" : "week";
  const today = iso(new Date());
  const anchor = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today;
  const span = view === "day" ? 1 : 7;
  const from = anchor;
  const to = addDays(anchor, span - 1);
  const divisionCode = sp.division && lines.some((l) => l.code === sp.division) ? sp.division : undefined;
  const serviceLineId = divisionCode ? lines.find((l) => l.code === divisionCode)!.id : undefined;
  const status = sp.status && (JOB_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const unassigned = sp.unassigned === "1";

  const [jobs, planned] = await Promise.all([
    listScheduleJobs(tenantId, from, to, { serviceLineId, status, unassigned }),
    unassigned || status ? Promise.resolve([] as PlannedVisit[]) : listPlannedVisits(tenantId, from, to),
  ]);
  const conflicts = detectConflicts(jobs);

  const byDate = new Map<string, { jobs: JobRow[]; planned: PlannedVisit[] }>();
  const days: string[] = [];
  for (let i = 0; i < span; i++) { const d = addDays(from, i); days.push(d); byDate.set(d, { jobs: [], planned: [] }); }
  for (const j of jobs) byDate.get(j.scheduled_date!)?.jobs.push(j);
  for (const p of planned) byDate.get(p.scheduled_date)?.planned.push(p);

  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view, from: anchor, division: divisionCode, status, unassigned: unassigned ? "1" : undefined, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/schedule?${p.toString()}`;
  };
  const linkCls = "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50";
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Schedule"
        description="Operational calendar — scheduled jobs and the forward pipeline of planned contract visits. Assign, reschedule and manage from each job; scheduling is always manually editable."
        actions={<Link href="/jobs" className="text-sm text-brand underline">Jobs list →</Link>}
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Link href={qs({ view: "day" })} className={chip(view === "day")}>Day</Link>
          <Link href={qs({ view: "week" })} className={chip(view === "week")}>Week</Link>
        </div>
        <div className="flex gap-1">
          <Link href={qs({ from: addDays(anchor, -span) })} className={linkCls}>←</Link>
          <Link href={qs({ from: today })} className={linkCls}>Today</Link>
          <Link href={qs({ from: addDays(anchor, span) })} className={linkCls}>→</Link>
        </div>
        <span className="text-sm text-neutral-500">{dayLabel(from)}{span > 1 ? ` – ${dayLabel(to)}` : ""}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Link href={qs({ division: undefined })} className={chip(!divisionCode)}>All divisions</Link>
          {lines.map((l) => <Link key={l.id} href={qs({ division: l.code })} className={chip(divisionCode === l.code)}>{l.name}</Link>)}
          <Link href={qs({ unassigned: unassigned ? undefined : "1" })} className={chip(unassigned)}>Unassigned only</Link>
        </div>
      </div>

      {/* Calendar */}
      <div className={view === "week" ? "grid grid-cols-1 gap-3 lg:grid-cols-1" : ""}>
        {days.map((d) => {
          const { jobs: dj, planned: dp } = byDate.get(d)!;
          const isToday = d === today;
          return (
            <Card key={d}>
              <div className={`flex items-center justify-between border-b border-neutral-100 px-4 py-2.5 ${isToday ? "bg-brand/5" : ""}`}>
                <div className="font-medium">{dayLabel(d)} {isToday && <Badge tone="brand" className="ml-1">Today</Badge>}</div>
                <div className="text-xs text-neutral-500">{dj.length} job(s){dp.length ? ` · ${dp.length} planned` : ""}</div>
              </div>
              <CardBody className="p-0 sm:p-0">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-neutral-100">
                    {dj.length === 0 && dp.length === 0 && <tr><td className="px-4 py-3 text-neutral-400">No jobs.</td></tr>}
                    {dj.map((j) => (
                      <tr key={j.id} className="hover:bg-neutral-50">
                        <td className="w-20 px-4 py-2 align-top font-mono text-xs text-neutral-500">{j.scheduled_start ?? "—"}{j.est_duration_minutes ? ` · ${j.est_duration_minutes}m` : ""}</td>
                        <td className="px-2 py-2">
                          <Link href={`/jobs/${j.id}`} className="font-medium text-brand hover:underline">{j.customer ?? "—"}</Link>
                          {j.branch && <span className="text-xs text-neutral-500"> · {j.branch}</span>}
                          <div className="text-xs text-neutral-500">
                            {j.service_line ?? "—"} · {j.assigned_count > 0 ? (j.technicians ?? j.team) : <span className="text-amber-600">unassigned</span>}
                          </div>
                        </td>
                        <td className="w-40 px-4 py-2 text-right align-top">
                          {conflicts.has(j.id) && <Badge tone="danger" className="mr-1">conflict</Badge>}
                          <Badge tone={TONE[j.status] ?? "neutral"}><span className="capitalize">{fmt(j.status)}</span></Badge>
                        </td>
                      </tr>
                    ))}
                    {dp.map((p) => (
                      <tr key={p.id} className="opacity-70">
                        <td className="px-4 py-2 align-top font-mono text-xs text-neutral-400">plan</td>
                        <td className="px-2 py-2">
                          <span className="font-medium">{p.customer ?? "—"}</span>
                          {p.branch && <span className="text-xs text-neutral-500"> · {p.branch}</span>}
                          <div className="text-xs text-neutral-500">{p.contract_number ?? "contract"}{p.visit_seq ? ` · visit ${p.visit_seq}` : ""}</div>
                        </td>
                        <td className="w-40 px-4 py-2 text-right align-top"><Badge tone="neutral">planned</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-neutral-500">Conflicts flag a technician double-booked across overlapping times on the same day. Planned = contract visits not yet turned into jobs.</p>
    </div>
  );
}
