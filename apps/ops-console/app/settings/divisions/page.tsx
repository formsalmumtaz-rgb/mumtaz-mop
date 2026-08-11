import { getTenantId } from "@/lib/tenant";
import { listDivisions } from "@/lib/domain/divisions";
import { AssumedBadge } from "@/components/AssumedBadge";
import { Card, Badge, Button, Field, Input, TableWrap, Thead, Tbody, PageHeader } from "@/components/ui";
import { createDivisionAction, updateDivisionAction, setDivisionActiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DivisionsPage() {
  const tenantId = await getTenantId();
  const divisions = await listDivisions(tenantId);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Divisions"
        description="Business divisions (service lines). Adding a division is configuration, not a deployment — a new division starts empty, then you configure its service types, categories, pricing, frequencies and material BOM from the (division-aware) admin. Switch divisions from the sidebar."
      />

      <Card>
        <details open={divisions.length === 0}>
          <summary className="cursor-pointer p-4 font-medium sm:p-5">New division</summary>
          <div className="border-t border-neutral-100 p-4 sm:p-5">
            <form action={createDivisionAction} className="flex flex-wrap items-end gap-3">
              <Field label="Code"><Input name="code" placeholder="e.g. hvac, ac_duct" className="w-48" required /></Field>
              <Field label="Name"><Input name="name" placeholder="e.g. HVAC Services" className="w-64" required /></Field>
              <Button type="submit">Create division</Button>
            </form>
            <p className="mt-2 text-xs text-neutral-500">Code is permanent (used in configuration + document branding). Lowercase letters/numbers/underscores.</p>
          </div>
        </details>
      </Card>

      <TableWrap minWidth={720}>
        <Thead>
          <tr>
            <th className="px-4 py-2.5 font-medium">Code</th>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium text-right">Service types</th>
            <th className="px-4 py-2.5 font-medium text-right">Categories</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium text-right">Actions</th>
          </tr>
        </Thead>
        <Tbody>
          {divisions.map((d) => (
            <tr key={d.id} className={`align-top ${d.is_active ? "" : "opacity-60"}`}>
              <td className="px-4 py-2.5 font-mono text-xs text-neutral-500">{d.code}</td>
              <td className="px-4 py-2.5">
                <div className="font-medium">{d.name}</div>
                {d.is_active && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-brand">Rename</summary>
                    <form action={updateDivisionAction} className="mt-2 flex items-end gap-2">
                      <input type="hidden" name="id" value={d.id} />
                      <Input name="name" defaultValue={d.name} className="w-56" />
                      <Button type="submit" size="sm" variant="secondary">Save</Button>
                    </form>
                  </details>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-neutral-700">{d.service_type_count}</td>
              <td className="px-4 py-2.5 text-right text-neutral-700">{d.category_count}</td>
              <td className="px-4 py-2.5">
                {!d.is_active ? <Badge>inactive</Badge>
                  : d.is_assumed ? <AssumedBadge /> : <Badge tone="success">✓ active</Badge>}
              </td>
              <td className="px-4 py-2.5 text-right">
                <form action={setDivisionActiveAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="active" value={d.is_active ? "0" : "1"} />
                  <button className={`text-xs ${d.is_active ? "text-neutral-500 hover:text-red-600" : "text-brand hover:underline"}`}>
                    {d.is_active ? "deactivate" : "reactivate"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </Tbody>
      </TableWrap>
    </div>
  );
}
