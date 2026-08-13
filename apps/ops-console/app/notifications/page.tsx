import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { scopedRead } from "@/lib/rls";
import { Badge, TableWrap, Thead, Tbody, PageHeader } from "@/components/ui";
import { resendNotificationAction, runSweepAction } from "./actions";

// Customer notifications (DOCUMENT 9 §D): the append-only delivery log with manual
// re-send. Notification-only — no reschedule/cancel links go out; customers call
// the team lead. Until the email provider key is set (BLOCKED A18) rows are
// 'logged' — the full pipeline runs without sending.
export const dynamic = "force-dynamic";

const TONE: Record<string, "neutral" | "brand" | "navy" | "success" | "warning" | "danger"> = {
  queued: "navy", logged: "neutral", sent: "success", delivered: "success", bounced: "danger", failed: "danger",
};

interface Row {
  id: string; kind: string; status: string; to_email: string | null; subject: string;
  customer: string | null; customer_id: string | null; created_at: string; sent_at: string | null;
  error: string | null; resend_of: string | null;
}

export default async function NotificationsPage() {
  const tenantId = await getTenantId();
  const { rows } = await scopedRead(tenantId,
    `select n.id, n.kind, n.status, n.to_email, n.subject, n.error, n.resend_of,
            n.created_at::text as created_at, n.sent_at::text as sent_at,
            cu.trade_name as customer, n.customer_id
       from outbound_notifications n
       left join customers cu on cu.id = n.customer_id
      where n.tenant_id = $1
      order by n.created_at desc limit 200`, [tenantId]);
  const list = rows as Row[];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Every customer email, logged before it is sent (append-only). Bounces flag the customer's email as a data-quality issue — never silent. No provider key set → rows log instead of sending (BLOCKED A18)."
        actions={
          <form action={runSweepAction}>
            <button className="rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark">Run sweep now</button>
          </form>
        }
      />
      <TableWrap>
        <table className="w-full min-w-[820px] text-sm">
          <Thead>
            <tr>
              <th className="px-3 py-2 text-left font-medium">When</th>
              <th className="px-3 py-2 text-left font-medium">Kind</th>
              <th className="px-3 py-2 text-left font-medium">Customer</th>
              <th className="px-3 py-2 text-left font-medium">To</th>
              <th className="px-3 py-2 text-left font-medium">Subject</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </Thead>
          <Tbody>
            {list.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                Nothing yet — notifications queue on contract activation, job completion, the daily 24h-notice sweep, and document expiry.
              </td></tr>
            )}
            {list.map((n) => (
              <tr key={n.id} className={n.resend_of ? "bg-neutral-50/50" : ""}>
                <td className="whitespace-nowrap px-3 py-2 text-neutral-500">{n.created_at.slice(0, 16)}</td>
                <td className="px-3 py-2"><span className="rounded bg-navy/10 px-1.5 py-0.5 text-xs text-navy">{n.kind.replace(/_/g, " ")}</span></td>
                <td className="px-3 py-2">{n.customer_id ? <Link className="text-brand underline" href={`/customers/${n.customer_id}`}>{n.customer ?? "—"}</Link> : "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{n.to_email ?? <span className="text-red-600">no email on file</span>}</td>
                <td className="max-w-[280px] truncate px-3 py-2" title={n.error ?? undefined}>{n.subject}</td>
                <td className="px-3 py-2"><Badge tone={TONE[n.status] ?? "neutral"}>{n.status}</Badge></td>
                <td className="px-3 py-2 text-right">
                  {["sent", "delivered", "bounced", "failed", "logged"].includes(n.status) && (
                    <form action={resendNotificationAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <button className="text-xs text-brand underline">re-send</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Tbody>
        </table>
      </TableWrap>
    </div>
  );
}
