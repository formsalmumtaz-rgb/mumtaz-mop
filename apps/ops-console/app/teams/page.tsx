import { getTenantId } from "@/lib/tenant";
import { listTeams } from "@/lib/domain/teams";
import { AssumedBadge } from "@/components/AssumedBadge";
import { createTeamAction, updateTeamAction, archiveTeamAction, restoreTeamAction } from "./actions";
import { ListToolbar } from "@/components/ListControls";

export const dynamic = "force-dynamic";

// Small inline add/edit form (code + name). Same form drives create and update.
function TeamForm({ action, initial, submitLabel }: {
  action: (fd: FormData) => Promise<void>;
  initial?: { id: string; code: string | null; name: string };
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <label className="text-sm"><span className="text-neutral-600">Code</span>
        <input name="code" defaultValue={initial?.code ?? ""} placeholder="e.g. TEAM-A"
               className="mt-1 block w-40 rounded border border-neutral-300 px-2 py-2" /></label>
      <label className="text-sm"><span className="text-neutral-600">Name</span>
        <input name="name" required defaultValue={initial?.name ?? ""}
               className="mt-1 block w-64 rounded border border-neutral-300 px-2 py-2" /></label>
      <button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">{submitLabel}</button>
    </form>
  );
}

export default async function TeamsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const q = (sp.q ?? "").trim().toLowerCase();
  const tenantId = await getTenantId();
  const all = await listTeams(tenantId, includeArchived);
  const teams = q ? all.filter((t) => (t.name ?? "").toLowerCase().includes(q) || (t.code ?? "").toLowerCase().includes(q)) : all;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Teams</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Field teams used across scheduling and assignment. Archiving a team deactivates it (it drops out of new-work pickers); history is preserved and nothing is deleted. Every change is audit-logged.
        </p>
      </div>

      <ListToolbar basePath="/teams" params={sp} placeholder="Search teams…" />

      {/* Create */}
      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={all.length === 0}>
        <summary className="cursor-pointer font-medium">New team</summary>
        <TeamForm action={createTeamAction} submitLabel="Create team" />
      </details>

      {/* List */}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {teams.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-500">{q ? "No teams match your search." : "No teams yet — add one above."}</td></tr>
            )}
            {teams.map((t) => (
              <tr key={t.id} className={`align-top ${!t.is_active ? "opacity-60" : ""}`}>
                <td className="px-4 py-2 font-mono text-xs text-neutral-500">{t.code ?? "—"}</td>
                <td className="px-4 py-2">
                  <div className="font-medium">{t.name}</div>
                  {t.is_active && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-brand">Edit</summary>
                      <TeamForm action={updateTeamAction} submitLabel="Save changes" initial={{ id: t.id, code: t.code, name: t.name }} />
                    </details>
                  )}
                </td>
                <td className="px-4 py-2">
                  {!t.is_active ? (
                    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">archived</span>
                  ) : t.is_assumed ? (
                    <AssumedBadge note={t.assumed_note} />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-300">✓ active</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {t.is_active ? (
                    <form action={archiveTeamAction}><input type="hidden" name="id" value={t.id} />
                      <button className="text-xs text-neutral-500 hover:text-red-600">archive</button></form>
                  ) : (
                    <form action={restoreTeamAction}><input type="hidden" name="id" value={t.id} />
                      <button className="text-xs text-brand hover:underline">restore</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
