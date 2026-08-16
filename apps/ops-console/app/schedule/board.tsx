"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moveJobAction } from "./actions";
import type { JobRow, PlannedVisit } from "@/lib/domain/jobs";
import { Card, CardBody, Badge } from "@/components/ui";

const TONE: Record<string, "neutral" | "brand" | "navy" | "success" | "warning" | "danger"> = {
  scheduled: "neutral", assigned: "navy", en_route: "navy", arrived: "navy",
  in_progress: "warning", completed: "success", failed: "danger", cancelled: "danger",
};
const fmt = (s: string) => s.replace(/_/g, " ");
const dayLabel = (s: string) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayNum = (s: string) => Number(s.slice(8, 10));

export interface BoardDay { date: string; jobs: JobRow[]; planned: PlannedVisit[] }

// The calendar surface. Day/week render as full rows; month renders a 7-column
// grid. Dragging a job card onto another day calls the server action, which
// moves the day only and notifies the customer. Completed and cancelled jobs are
// not draggable — history is not rescheduled.
export function ScheduleBoard({ days, view, today, conflictIds }: {
  days: BoardDay[]; view: "day" | "week" | "month"; today: string; conflictIds: string[];
}) {
  const conflicts = new Set(conflictIds);
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDate, setOverDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Optimistic day override so the card jumps immediately on drop.
  const [moved, setMoved] = useState<Record<string, string>>({});

  const canDrag = (j: JobRow) => !["completed", "cancelled"].includes(j.status);
  const dayOf = (j: JobRow) => moved[j.id] ?? j.scheduled_date!;

  const drop = (date: string) => {
    const id = dragId;
    setDragId(null); setOverDate(null);
    if (!id) return;
    const job = days.flatMap((d) => d.jobs).find((j) => j.id === id);
    if (!job || dayOf(job) === date) return;
    const previous = dayOf(job);
    setMoved((m) => ({ ...m, [id]: date }));
    setError(null);
    startTransition(async () => {
      const res = await moveJobAction(id, date);
      if (!res.ok) {
        setMoved((m) => ({ ...m, [id]: previous })); // put it back where it was
        setError(res.error);
      }
    });
  };

  const jobCard = (j: JobRow, compact: boolean) => (
    <div
      key={j.id}
      draggable={canDrag(j)}
      onDragStart={() => setDragId(j.id)}
      onDragEnd={() => { setDragId(null); setOverDate(null); }}
      className={`overflow-hidden rounded-md border px-2 py-1.5 text-xs transition ${
        canDrag(j) ? "cursor-grab active:cursor-grabbing hover:border-brand/40 hover:shadow-sm" : "opacity-70"
      } ${dragId === j.id ? "opacity-40" : ""} ${conflicts.has(j.id) ? "border-red-300 bg-red-50" : "border-neutral-200 bg-white"}`}
      title={canDrag(j) ? "Drag to another day to reschedule" : `A ${j.status} job cannot be moved`}
    >
      <div className="flex items-start justify-between gap-1">
        <Link href={`/jobs/${j.id}`} className="truncate font-medium text-brand hover:underline">{j.customer ?? "N/A"}</Link>
        {j.scheduled_start && <span className="shrink-0 font-mono text-[10px] text-neutral-500">{j.scheduled_start}</span>}
      </div>
      {!compact && j.branch && <div className="text-[11px] text-neutral-500">{j.branch}</div>}
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        <Badge tone={TONE[j.status] ?? "neutral"}><span className="capitalize">{fmt(j.status)}</span></Badge>
        {conflicts.has(j.id) && <Badge tone="danger">conflict</Badge>}
        {j.assigned_count === 0 && <span className="text-[11px] text-amber-600">unassigned</span>}
      </div>
      {!compact && j.assigned_count > 0 && <div className="text-[11px] text-neutral-500">{j.technicians ?? j.team}</div>}
    </div>
  );

  const plannedCard = (p: PlannedVisit) => (
    <div key={p.id} className="rounded-md border border-dashed border-neutral-300 px-2 py-1.5 text-xs text-neutral-500">
      <div className="font-medium text-neutral-600">{p.customer ?? "N/A"}</div>
      <div className="text-[11px]">{p.contract_number ?? "contract"}{p.visit_seq ? ` · visit ${p.visit_seq}` : ""} · planned</div>
    </div>
  );

  const dropProps = (date: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOverDate(date); },
    onDragLeave: () => setOverDate((d) => (d === date ? null : d)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); drop(date); },
  });

  const jobsOn = (date: string) =>
    days.flatMap((d) => d.jobs).filter((j) => dayOf(j) === date);

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not move that job: {error}
        </div>
      )}
      {pending && <div className="text-xs text-neutral-500">Saving the new date…</div>}

      {view === "month" ? (
        <div className="grid grid-cols-7 gap-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{d}</div>
          ))}
          {days.map((d) => {
            const dayJobs = jobsOn(d.date);
            return (
              <div key={d.date} {...dropProps(d.date)}
                className={`min-h-[104px] rounded-lg border p-1.5 transition ${
                  overDate === d.date ? "border-brand bg-brand/5" : "border-neutral-200 bg-white"
                } ${d.date === today ? "ring-1 ring-brand/40" : ""}`}>
                <div className="mb-1 flex items-center justify-between px-0.5">
                  <span className={`text-xs font-semibold ${d.date === today ? "text-brand" : "text-neutral-500"}`}>{dayNum(d.date)}</span>
                  {dayJobs.length > 0 && <span className="text-[10px] text-neutral-400">{dayJobs.length}</span>}
                </div>
                <div className="space-y-1">
                  {dayJobs.map((j) => jobCard(j, true))}
                  {d.planned.map(plannedCard)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        days.map((d) => {
          const dayJobs = jobsOn(d.date);
          return (
            <Card key={d.date}>
              <div className={`flex items-center justify-between border-b border-neutral-100 px-4 py-2.5 ${d.date === today ? "bg-brand/5" : ""}`}>
                <div className="font-medium">{dayLabel(d.date)} {d.date === today && <Badge tone="brand" className="ml-1">Today</Badge>}</div>
                <div className="text-xs text-neutral-500">{dayJobs.length} job(s){d.planned.length ? ` · ${d.planned.length} planned` : ""}</div>
              </div>
              <CardBody className={`space-y-1.5 transition ${overDate === d.date ? "bg-brand/5" : ""}`} {...dropProps(d.date)}>
                {dayJobs.length === 0 && d.planned.length === 0 && <p className="text-sm text-neutral-400">No jobs. Drag one here to move it to this day.</p>}
                {dayJobs.map((j) => jobCard(j, false))}
                {d.planned.map(plannedCard)}
              </CardBody>
            </Card>
          );
        })
      )}
    </div>
  );
}
