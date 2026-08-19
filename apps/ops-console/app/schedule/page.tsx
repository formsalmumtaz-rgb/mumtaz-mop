import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listScheduleJobs, listScheduledAreas, listShifts, listPlannedVisits, detectConflicts, JOB_STATUSES, type JobRow, type PlannedVisit } from "@/lib/domain/jobs";
import { listTeams } from "@/lib/domain/teams";
import { listServiceLines } from "@/lib/domain/reference";
import { PageHeader } from "@/components/ui";
import { ScheduleBoard, type BoardDay } from "./board";

export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(new Date(s + "T00:00:00Z").getTime() + n * 864e5));
const dayLabel = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const monthLabel = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
// Monday-first grid: the calendar starts on the Monday on or before the 1st and
// runs whole weeks, so the month view is always a clean 7-column block.
const mondayBefore = (s: string) => {
  const d = new Date(s + "T00:00:00Z");
  return addDays(s, -((d.getUTCDay() + 6) % 7));
};

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const lines = await listServiceLines(tenantId);

  const view = sp.view === "day" ? "day" : sp.view === "month" ? "month" : "week";
  const today = iso(new Date());
  const anchor = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today;

  let from: string, to: string, span: number, step: number;
  if (view === "month") {
    const first = anchor.slice(0, 8) + "01";
    from = mondayBefore(first);
    const nextMonth = iso(new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 1)));
    span = Math.ceil((Date.parse(nextMonth) - Date.parse(from)) / 864e5 / 7) * 7;
    to = addDays(from, span - 1);
    step = 0; // month navigation steps by calendar month, not by days
  } else {
    span = view === "day" ? 1 : 7;
    from = anchor;
    to = addDays(anchor, span - 1);
    step = span;
  }

  const divisionCode = sp.division && lines.some((l) => l.code === sp.division) ? sp.division : undefined;
  const serviceLineId = divisionCode ? lines.find((l) => l.code === divisionCode)!.id : undefined;
  const status = sp.status && (JOB_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const unassigned = sp.unassigned === "1";
  // §3.4 filters. The team list is master data; the AREA list is derived from the
  // work actually in this window, so it never offers an empty district.
  const [teams, areas, shifts] = await Promise.all([
    listTeams(tenantId), listScheduledAreas(tenantId, from, to), listShifts(tenantId),
  ]);
  const teamId = sp.team && teams.some((t) => t.id === sp.team) ? sp.team : undefined;
  const area = sp.area && areas.some((a) => a.area === sp.area) ? sp.area : undefined;
  const shiftId = sp.shift && shifts.some((x) => x.id === sp.shift) ? sp.shift : undefined;

  const [jobs, planned] = await Promise.all([
    listScheduleJobs(tenantId, from, to, { serviceLineId, status, unassigned, teamId, area, shiftId }),
    unassigned || status ? Promise.resolve([] as PlannedVisit[]) : listPlannedVisits(tenantId, from, to),
  ]);
  const conflicts = detectConflicts(jobs);

  const byDate = new Map<string, BoardDay>();
  const days: BoardDay[] = [];
  for (let i = 0; i < span; i++) {
    const d = addDays(from, i);
    const entry: BoardDay = { date: d, jobs: [], planned: [] };
    days.push(entry); byDate.set(d, entry);
  }
  for (const j of jobs) byDate.get(j.scheduled_date!)?.jobs.push(j as JobRow);
  for (const p of planned) byDate.get(p.scheduled_date)?.planned.push(p);

  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view, from: anchor, division: divisionCode, status,
                     unassigned: unassigned ? "1" : undefined, team: teamId, area, shift: shiftId, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/schedule?${p.toString()}`;
  };
  const shiftMonth = (n: number) => {
    const y = Number(anchor.slice(0, 4)), m = Number(anchor.slice(5, 7));
    return iso(new Date(Date.UTC(y, m - 1 + n, 1)));
  };
  const prev = view === "month" ? shiftMonth(-1) : addDays(anchor, -step);
  const next = view === "month" ? shiftMonth(1) : addDays(anchor, step);

  const linkCls = "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50";
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Schedule"
        description="Operational calendar — scheduled jobs and the forward pipeline of planned contract visits. Drag a job onto another day to move it; the customer is notified automatically."
        actions={<Link href="/jobs" className="text-sm text-brand underline">Jobs list →</Link>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Link href={qs({ view: "day" })} className={chip(view === "day")}>Day</Link>
          <Link href={qs({ view: "week" })} className={chip(view === "week")}>Week</Link>
          <Link href={qs({ view: "month" })} className={chip(view === "month")}>Month</Link>
        </div>
        <div className="flex gap-1">
          <Link href={qs({ from: prev })} className={linkCls}>←</Link>
          <Link href={qs({ from: today })} className={linkCls}>Today</Link>
          <Link href={qs({ from: next })} className={linkCls}>→</Link>
        </div>
        <span className="text-sm text-neutral-500">
          {view === "month" ? monthLabel(anchor) : `${dayLabel(from)}${span > 1 ? ` – ${dayLabel(to)}` : ""}`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Link href={qs({ division: undefined })} className={chip(!divisionCode)}>All divisions</Link>
          {lines.map((l) => <Link key={l.id} href={qs({ division: l.code })} className={chip(divisionCode === l.code)}>{l.name}</Link>)}
          <Link href={qs({ unassigned: unassigned ? undefined : "1" })} className={chip(unassigned)}>Unassigned only</Link>
        </div>
      </div>

      {/* §3.4 — team and area filters, so the office can look at one crew or one
          district at a time. Areas come from the work in view, not a master list. */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs uppercase tracking-wide text-neutral-500">Shift</span>
        <Link href={qs({ shift: undefined })} className={chip(!shiftId)}>All</Link>
        {shifts.map((x) => (
          <Link key={x.id} href={qs({ shift: x.id })} className={chip(shiftId === x.id)}>{x.name}</Link>
        ))}
        <span className="ml-3 mr-1 text-xs uppercase tracking-wide text-neutral-500">Team</span>
        <Link href={qs({ team: undefined })} className={chip(!teamId)}>All</Link>
        {teams.map((t) => (
          <Link key={t.id} href={qs({ team: t.id })} className={chip(teamId === t.id)}>{t.name}</Link>
        ))}
        {areas.length > 0 && (
          <>
            <span className="ml-3 mr-1 text-xs uppercase tracking-wide text-neutral-500">Area</span>
            <Link href={qs({ area: undefined })} className={chip(!area)}>All</Link>
            {areas.slice(0, 12).map((a) => (
              <Link key={a.area} href={qs({ area: a.area })} className={chip(area === a.area)}>
                {a.area} <span className="text-neutral-400">{a.jobs}</span>
              </Link>
            ))}
          </>
        )}
      </div>

      <ScheduleBoard days={days} view={view} today={today} conflictIds={[...conflicts]} />

      <p className="text-xs text-neutral-500">
        Drag a job card onto another day to reschedule it — the time on the job is kept, the move is written to the audit log, and the
        customer gets a “your visit has moved” email. Completed and cancelled jobs cannot be dragged. Conflicts flag a technician
        double-booked across overlapping times on the same day. Planned = contract visits not yet turned into jobs.
      </p>
    </div>
  );
}
