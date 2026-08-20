import { getTenantId } from "@/lib/tenant";
import { requireView } from "@/lib/auth";
import { listHrRequests, attendanceSummary } from "@/lib/domain/hr";
import { PageHeader, TableWrap, Thead, Tbody, Badge } from "@/components/ui";
import { FilterChips } from "@/components/ListControls";
import { decideHrRequestAction } from "./actions";

// §3.10 — the office side of §3.7. Requests raised on a phone land here; nothing
// is decided automatically, and a decision always records who made it.
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  sick_leave: "Sick leave", annual_leave: "Annual leave", unpaid_leave: "Unpaid leave",
  advance: "Salary advance", document: "Document request", other: "Other",
};
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

export default async function HrPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireView("hr.view")   /* was technician.edit, which operations holds — HR is barred to that role */;
  const tenantId = await getTenantId();
  const status = sp.status && ["submitted", "approved", "declined"].includes(sp.status) ? sp.status : undefined;
  const from = sp.from ?? monthStart(), to = sp.to ?? today();
  const [requests, attendance] = await Promise.all([
    listHrRequests(tenantId, status),
    attendanceSummary(tenantId, from, to),
  ]);
  const pending = requests.filter((r) => r.status === "submitted").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        description={`${pending} request${pending === 1 ? "" : "s"} waiting. Attendance and hours below come from the technicians' own clock — nothing is re-keyed, and payroll reads the same figures.`}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-medium">Requests</h2>
          <FilterChips basePath="/hr" params={sp} name="status" allLabel="All"
            options={[{ value: "submitted", label: "Waiting" }, { value: "approved", label: "Approved" },
                      { value: "declined", label: "Declined" }]} />
        </div>
        {requests.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-neutral-500">
            Nothing here. Requests raised in the technician app appear for approval.
          </div>
        ) : requests.map((r) => (
          <div key={r.id} className={`rounded-lg border p-4 ${r.status === "submitted" ? "border-amber-300 bg-amber-50/40" : "border-neutral-200 bg-white"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-medium">{r.technician ?? "—"}</span>
                <span className="ml-2 text-sm text-neutral-600">{KIND[r.kind] ?? r.kind}</span>
                {r.from_date && (
                  <span className="ml-2 text-sm text-neutral-600">
                    {r.from_date}{r.to_date && r.to_date !== r.from_date ? ` → ${r.to_date}` : ""}
                    {r.days ? ` · ${r.days} day${r.days === 1 ? "" : "s"}` : ""}
                  </span>
                )}
              </div>
              <Badge tone={r.status === "approved" ? "success" : r.status === "submitted" ? "warning" : "neutral"}>
                {r.status === "submitted" ? "waiting" : r.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-neutral-800">{r.reason}</p>
            {r.decision_note && <p className="mt-1 text-sm text-neutral-500">Office: {r.decision_note}</p>}

            {r.status === "submitted" && (
              <form action={decideHrRequestAction} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input name="note" placeholder="A note back to them (optional)"
                       className="min-w-56 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
                <button name="decision" value="approved"
                        className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
                  Approve
                </button>
                <button name="decision" value="declined"
                        className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50">
                  Decline
                </button>
              </form>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Attendance &amp; hours — {from} to {to}</h2>
        <p className="text-sm text-neutral-600">
          Straight from each technician&rsquo;s own TIME IN / TIME OUT. This is what a payroll run reads.
        </p>
        <TableWrap minWidth={560}>
            <Thead>
              <tr>
                <th className="px-3 py-2 text-left font-medium">Technician</th>
                <th className="px-3 py-2 text-right font-medium">Days present</th>
                <th className="px-3 py-2 text-right font-medium">Hours</th>
                <th className="px-3 py-2 text-right font-medium">Approved leave</th>
              </tr>
            </Thead>
            <Tbody>
              {attendance.map((a) => (
                <tr key={a.technician_id}>
                  <td className="px-3 py-2">{a.full_name}</td>
                  <td className="px-3 py-2 text-right">{a.days_present}</td>
                  <td className="px-3 py-2 text-right font-medium">{Number(a.hours).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{a.days_on_leave || "—"}</td>
                </tr>
              ))}
            </Tbody>
        </TableWrap>
      </section>
    </div>
  );
}
