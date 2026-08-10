import { getTenantId } from "@/lib/tenant";
import { listTechniciansPaged } from "@/lib/domain/technicians";
import { parseListParams } from "@/lib/list";
import { ListToolbar, Pagination } from "@/components/ListControls";
import { AssumedBadge } from "@/components/AssumedBadge";
import { Card, CardBody, Badge, Button, TableWrap, Thead, Tbody, PageHeader } from "@/components/ui";
import { TechnicianForm } from "./TechnicianForm";
import {
  createTechnicianAction, updateTechnicianAction, confirmAction,
  archiveTechnicianAction, restoreTechnicianAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function TechniciansPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lp = parseListParams(sp);
  const tenantId = await getTenantId();
  const { rows: techs, total } = await listTechniciansPaged(tenantId, lp);
  const assumed = techs.filter((t) => t.is_assumed).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Technicians"
        description={`${total} total${assumed > 0 ? ` · ${assumed} placeholder name(s) to confirm on this page` : ""}. Add, edit, and archive the workforce master — every change is audit-logged.`}
      />

      <ListToolbar basePath="/technicians" params={sp} placeholder="Search code, name, phone, or ref…" />

      {/* Create */}
      <Card>
        <details open={total === 0}>
          <summary className="cursor-pointer p-4 font-medium sm:p-5">New technician</summary>
          <div className="border-t border-neutral-100 p-4 sm:p-5">
            <TechnicianForm action={createTechnicianAction} submitLabel="Create technician" />
          </div>
        </details>
      </Card>

      {/* List */}
      <TableWrap>
        <Thead>
          <tr>
            <th className="px-4 py-2.5 font-medium">Code</th>
            <th className="px-4 py-2.5 font-medium">Full name</th>
            <th className="px-4 py-2.5 font-medium">Phone</th>
            <th className="px-4 py-2.5 font-medium">Employee ref</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium text-right">Actions</th>
          </tr>
        </Thead>
        <Tbody>
          {techs.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-500">{lp.q ? "No technicians match your search." : "No technicians yet — add one above."}</td></tr>
          )}
          {techs.map((t) => (
            <tr key={t.id} className={`align-top ${t.archived_at ? "opacity-60" : ""}`}>
              <td className="px-4 py-2.5 font-mono text-xs text-neutral-500">{t.code ?? "—"}</td>
              <td className="px-4 py-2.5">
                <div className="font-medium">{t.full_name ?? "—"}</div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-brand">Edit</summary>
                  <TechnicianForm
                    action={updateTechnicianAction}
                    submitLabel="Save changes"
                    initial={{ id: t.id, code: t.code, full_name: t.full_name, phone: t.phone, employee_ref: t.employee_ref }}
                  />
                </details>
              </td>
              <td className="px-4 py-2.5 text-neutral-600">{t.phone ?? "—"}</td>
              <td className="px-4 py-2.5 text-neutral-600">{t.employee_ref ?? "—"}</td>
              <td className="px-4 py-2.5">
                {t.archived_at ? <Badge>archived</Badge>
                  : t.is_assumed ? <AssumedBadge note={t.assumed_note} />
                  : <Badge tone="success">✓ confirmed</Badge>}
              </td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex items-center justify-end gap-2">
                  {t.is_assumed && !t.archived_at && (
                    <form action={confirmAction} className="inline">
                      <input type="hidden" name="id" value={t.id} />
                      <Button type="submit" size="sm" variant="secondary" className="border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100">Confirm value</Button>
                    </form>
                  )}
                  {t.archived_at ? (
                    <form action={restoreTechnicianAction}><input type="hidden" name="id" value={t.id} />
                      <button className="text-xs text-brand hover:underline">restore</button></form>
                  ) : (
                    <form action={archiveTechnicianAction}><input type="hidden" name="id" value={t.id} />
                      <button className="text-xs text-neutral-500 hover:text-red-600">archive</button></form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Tbody>
      </TableWrap>

      <Pagination basePath="/technicians" params={sp} page={lp.page} pageSize={lp.pageSize} total={total} />
    </div>
  );
}
