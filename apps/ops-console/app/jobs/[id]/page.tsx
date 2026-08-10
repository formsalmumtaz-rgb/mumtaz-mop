import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getJob } from "@/lib/domain/jobs";
import { listTeams } from "@/lib/domain/teams";
import { listTechnicians } from "@/lib/domain/technicians";
import { Card, CardBody, Badge, Button, Field, Input, Select, PageHeader } from "@/components/ui";
import { assignJobAction, rescheduleJobAction, setJobStatusAction } from "./actions";

export const dynamic = "force-dynamic";
const fmt = (s: string) => s.replace(/_/g, " ");
const TONE: Record<string, "neutral" | "brand" | "navy" | "success" | "warning" | "danger"> = {
  scheduled: "neutral", assigned: "navy", en_route: "navy", arrived: "navy",
  in_progress: "warning", completed: "success", failed: "danger", cancelled: "danger",
};

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const job = await getJob(tenantId, id);
  if (!job) notFound();
  const [teams, techs] = await Promise.all([listTeams(tenantId), listTechnicians(tenantId)]);
  const canCancel = !["completed", "cancelled"].includes(job.status);
  const mapsUrl = job.lat != null && job.lng != null ? `https://www.google.com/maps/search/?api=1&query=${job.lat},${job.lng}` : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={job.customer ?? "Job"}
        description={<>
          {job.service_line ?? "—"}{job.job_type ? ` · ${job.job_type}` : ""}{job.contract_id ? " · contract" : " · ad-hoc"}
          {job.contract_number ? ` · ${job.contract_number}` : ""}
        </>}
        actions={<>
          <Link href="/schedule" className="text-sm text-brand underline">← Schedule</Link>
          <Badge tone={TONE[job.status] ?? "neutral"}><span className="capitalize">{fmt(job.status)}</span></Badge>
        </>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card><CardBody>
          <div className="text-xs uppercase tracking-wide text-neutral-500">When</div>
          <div className="mt-1 text-lg font-semibold">{job.scheduled_date ?? "unscheduled"}{job.scheduled_start ? ` · ${job.scheduled_start}` : ""}</div>
          <div className="text-sm text-neutral-500">{job.est_duration_minutes ? `${job.est_duration_minutes} min` : "no duration set"}</div>
        </CardBody></Card>
        <Card><CardBody>
          <div className="text-xs uppercase tracking-wide text-neutral-500">Where</div>
          <div className="mt-1 text-sm">{job.branch ?? "—"}</div>
          {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand underline">open map pin →</a> : <div className="text-xs text-amber-600">no GPS pin</div>}
        </CardBody></Card>
        <Card><CardBody>
          <div className="text-xs uppercase tracking-wide text-neutral-500">Team</div>
          <div className="mt-1 text-sm">{job.team ?? "—"}</div>
          <div className="text-sm text-neutral-600">{job.technicians ?? "no technicians assigned"}</div>
        </CardBody></Card>
      </div>

      {job.instructions && (
        <Card><CardBody><div className="text-xs uppercase tracking-wide text-neutral-500">Instructions</div><p className="mt-1 text-sm">{job.instructions}</p></CardBody></Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Assign */}
        <Card><CardBody>
          <h2 className="font-medium">Assign team &amp; technicians</h2>
          <form action={assignJobAction} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={job.id} />
            <Field label="Team">
              <Select name="team_id" defaultValue={job.team_id ?? ""}>
                <option value="">— no team —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <div>
              <div className="text-sm text-neutral-600">Technicians</div>
              <div className="mt-1 max-h-44 overflow-y-auto rounded-md border border-neutral-300 p-2">
                {techs.length === 0 && <p className="text-sm text-neutral-500">No technicians.</p>}
                {techs.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <input type="checkbox" name="technician_ids" value={t.id} defaultChecked={job.technician_ids.includes(t.id)} />
                    {t.full_name ?? t.code}
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit">Save assignment</Button>
          </form>
        </CardBody></Card>

        {/* Reschedule + status */}
        <Card><CardBody>
          <h2 className="font-medium">Reschedule</h2>
          <form action={rescheduleJobAction} className="mt-3 grid grid-cols-2 gap-3">
            <input type="hidden" name="id" value={job.id} />
            <Field label="Date"><Input name="scheduled_date" type="date" defaultValue={job.scheduled_date ?? ""} required /></Field>
            <Field label="Start time"><Input name="scheduled_start" type="time" defaultValue={job.scheduled_start ?? ""} /></Field>
            <Field label="Duration (min)"><Input name="est_duration_minutes" type="number" min="0" step="5" defaultValue={job.est_duration_minutes ?? ""} /></Field>
            <div className="self-end"><Button type="submit" variant="secondary">Save schedule</Button></div>
          </form>
          <div className="mt-4 border-t border-neutral-100 pt-3">
            <h2 className="font-medium">Status</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {canCancel && (
                <form action={setJobStatusAction}><input type="hidden" name="id" value={job.id} /><input type="hidden" name="status" value="cancelled" />
                  <Button type="submit" variant="danger" size="sm">Cancel job</Button></form>
              )}
              {job.status === "cancelled" && (
                <form action={setJobStatusAction}><input type="hidden" name="id" value={job.id} /><input type="hidden" name="status" value="scheduled" />
                  <Button type="submit" variant="secondary" size="sm">Reopen (→ scheduled)</Button></form>
              )}
            </div>
            <p className="mt-2 text-xs text-neutral-500">Completion is recorded by the technician in the field app — the office schedules, assigns and cancels, but never fabricates a completion.</p>
          </div>
        </CardBody></Card>
      </div>
    </div>
  );
}
