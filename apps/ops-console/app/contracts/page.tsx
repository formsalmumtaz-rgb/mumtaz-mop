import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listAllContracts } from "@/lib/domain/contracts";
import { Badge, TableWrap, Thead, Tbody, PageHeader } from "@/components/ui";
import { ExportButtons, FilterChips } from "@/components/ListControls";

// Contracts list (Release 1 item 1). Contracts previously had no list page and no
// nav entry — reachable only via a customer, an estimate, or the billing table.
export const dynamic = "force-dynamic";

const aed = (n: string | null, ccy: string | null) =>
  n == null ? "—" : `${ccy ?? "AED"} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default async function ContractsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tenantId = await getTenantId();
  const all = await listAllContracts(tenantId);
  const statusFilter = (sp.status ?? "").trim();
  const contracts = statusFilter ? all.filter((c) => c.lifecycle_status === statusFilter) : all;
  const active = contracts.filter((c) => c.lifecycle_status === "active").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contracts"
        description={`${contracts.length} contracts · ${active} active. A contract is created from an accepted estimate (or from a customer profile); activating it generates the schedule and jobs.`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips basePath="/contracts" params={sp} name="status" allLabel="All statuses"
          options={[{ value: "draft", label: "Draft" }, { value: "active", label: "Active" },
                    { value: "expired", label: "Expired" }, { value: "cancelled", label: "Cancelled" }]} />
        <div className="ml-auto"><ExportButtons dataset="contracts" params={sp} /></div>
      </div>
      <TableWrap>
        <table className="w-full min-w-[760px] text-sm">
          <Thead>
            <tr>
              <th className="px-3 py-2 text-left font-medium">Contract</th>
              <th className="px-3 py-2 text-left font-medium">Customer</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-3 py-2 text-left font-medium">Frequency</th>
              <th className="px-3 py-2 text-left font-medium">Term</th>
              <th className="px-3 py-2 text-right font-medium">Jobs</th>
            </tr>
          </Thead>
          <Tbody>
            {contracts.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                No contracts yet. Accept an estimate and convert it, or create one from a customer profile.
              </td></tr>
            )}
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2">
                  <Link href={`/contracts/${c.id}`} className="font-medium text-brand underline">
                    {c.contract_number ?? "(no number)"}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/customers/${c.customer_id}`} className="text-neutral-700 underline decoration-neutral-300 hover:text-brand">
                    {c.customer_name ?? "—"}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={c.lifecycle_status === "active" ? "success" : "neutral"}>{c.lifecycle_status}</Badge>
                </td>
                <td className="px-3 py-2 text-right">{aed(c.contract_value, c.currency)}</td>
                <td className="px-3 py-2 text-neutral-600">{c.frequency_name ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">
                  {c.start_date ? `${c.start_date} → ${c.end_date ?? "?"}` : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {c.jobs_count > 0
                    ? <Link href={`/jobs?contract=${c.id}`} className="text-brand underline">{c.jobs_count}</Link>
                    : <span className="text-neutral-400">0</span>}
                </td>
              </tr>
            ))}
          </Tbody>
        </table>
      </TableWrap>
    </div>
  );
}
