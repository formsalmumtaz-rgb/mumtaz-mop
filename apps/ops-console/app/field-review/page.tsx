import { requireView } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { listHeldFieldEvents } from "@/lib/domain/fieldReview";
import { approveFieldEventAction, rejectFieldEventAction } from "./actions";
import { Card, Badge, TableWrap, Thead, Tbody, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FieldReviewPage() {
  await requireView("settings.manage");
  const tenantId = await getTenantId();
  const held = await listHeldFieldEvents(tenantId);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Field events held for review"
        description="Events that reached the server from a technician login that had been revoked. They are held here — never posted automatically and never discarded. Approve to let one post normally, or reject so it never posts. Both are audited."
      />

      {held.length === 0 ? (
        <Card><div className="p-6 text-center text-neutral-500">Nothing held for review.</div></Card>
      ) : (
        <TableWrap minWidth={860}>
          <Thead>
            <tr>
              <th className="px-4 py-2.5 font-medium">Event</th>
              <th className="px-4 py-2.5 font-medium">Technician</th>
              <th className="px-4 py-2.5 font-medium">Device time</th>
              <th className="px-4 py-2.5 font-medium">Received</th>
              <th className="px-4 py-2.5 font-medium">Reason</th>
              <th className="px-4 py-2.5 font-medium text-right">Action</th>
            </tr>
          </Thead>
          <Tbody>
            {held.map((e) => (
              <tr key={e.event_id} className="align-top">
                <td className="px-4 py-2.5">
                  <div className="font-mono text-xs">{e.event_type}</div>
                  <div className="font-mono text-xs text-neutral-400">job {e.job_id?.slice(0, 8) ?? "—"}</div>
                </td>
                <td className="px-4 py-2.5 text-neutral-700">{e.actor_name ?? "—"}</td>
                <td className="px-4 py-2.5 text-neutral-700">
                  {e.device_time?.slice(0, 16).replace("T", " ") ?? "—"}
                  {e.time_suspect && <div className="mt-0.5"><Badge tone="warning">clock suspect</Badge></div>}
                </td>
                <td className="px-4 py-2.5 text-neutral-500">{e.server_received_at.slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-2.5 text-neutral-600">{e.review_reason ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    <form action={approveFieldEventAction}><input type="hidden" name="event_id" value={e.event_id} />
                      <button className="rounded border border-emerald-300 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50">Approve</button></form>
                    <form action={rejectFieldEventAction}><input type="hidden" name="event_id" value={e.event_id} />
                      <button className="rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:text-red-600">Reject</button></form>
                  </div>
                </td>
              </tr>
            ))}
          </Tbody>
        </TableWrap>
      )}
    </div>
  );
}
