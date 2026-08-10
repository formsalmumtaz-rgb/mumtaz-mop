import { getTenantId } from "@/lib/tenant";
import { listTeams } from "@/lib/domain/teams";
import { AssumedBadge } from "@/components/AssumedBadge";
import { Card, Badge, Button, Field, Input, TableWrap, Thead, Tbody, PageHeader } from "@/components/ui";
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
      <Field label="Code"><Input name="code" defaultValue={initial?.code ?? ""} placeholder="e.g. TEAM-A" className="w-40" /></Field>
      <Field label="Name"><Input name="name" required defaultValue={initial?.name ?? ""} className="w-64" /></Field>
      <Button type="submit">{submitLabel}</Button>
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
      <PageHeader
        title="Teams"
        description="Field teams used across scheduling and assignment. Archiving a team deactivates it (it drops out of new-work pickers); history is preserved and nothing is deleted. Every change is audit-logged."
      />

      <ListToolbar basePath="/teams" params={sp} placeholder="Search teams…" />

      {/* Create */}
      <Card>
        <details open={all.length === 0}>
          <summary className="cursor-pointer p-4 font-medium sm:p-5">New team</summary>
          <div className="border-t border-neutral-100 p-4 sm:p-5"><TeamForm action={createTeamAction} submitLabel="Create team" /></div>
        </details>
      </Card>

      {/* List */}
      <TableWrap>
        <Thead>
          <tr>
            <th className="px-4 py-2.5 font-medium">Code</th>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium text-right">Actions</th>
          </tr>
        </Thead>
        <Tbody>
          {teams.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-500">{q ? "No teams match your search." : "No teams yet — add one above."}</td></tr>
          )}
          {teams.map((t) => (
            <tr key={t.id} className={`align-top ${!t.is_active ? "opacity-60" : ""}`}>
              <td className="px-4 py-2.5 font-mono text-xs text-neutral-500">{t.code ?? "—"}</td>
              <td className="px-4 py-2.5">
                <div className="font-medium">{t.name}</div>
                {t.is_active && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-brand">Edit</summary>
                    <TeamForm action={updateTeamAction} submitLabel="Save changes" initial={{ id: t.id, code: t.code, name: t.name }} />
                  </details>
                )}
              </td>
              <td className="px-4 py-2.5">
                {!t.is_active ? <Badge>archived</Badge>
                  : t.is_assumed ? <AssumedBadge note={t.assumed_note} />
                  : <Badge tone="success">✓ active</Badge>}
              </td>
              <td className="px-4 py-2.5 text-right">
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
        </Tbody>
      </TableWrap>
    </div>
  );
}
