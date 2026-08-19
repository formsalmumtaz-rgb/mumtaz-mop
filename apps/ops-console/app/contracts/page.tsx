import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listAllContracts } from "@/lib/domain/contracts";
import { Badge, TableWrap, Thead, Tbody, PageHeader } from "@/components/ui";
import { ExportButtons, FilterChips, ListToolbar } from "@/components/ListControls";
import { RowLink } from "@/components/RowLink";

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
  // Search by NUMBER first, then account number, then customer name (§3.2).
  const q = (sp.q ?? "").trim().toLowerCase();
  const contracts = all
    .filter((c) => (statusFilter ? c.lifecycle_status === statusFilter : true))
    .filter((c) => !q
      || (c.contract_number ?? "").toLowerCase().includes(q)
      || (c.customer_code ?? "").toLowerCase().includes(q)
      || (c.customer_name ?? "").toLowerCase().includes(q));
  const active = contracts.filter((c) => c.lifecycle_status === "active").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contracts"
        description={`${contracts.length} contracts · ${active} active. A contract is created from an accepted estimate (or from a customer profile); activating it generates the schedule and jobs.`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <ListToolbar basePath="/contracts" params={sp} placeholder="Contract no., account no. or customer" showArchived={false} />
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
              <th className="px-3 py-2 text-left font-medium">Account no.</th>
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
              <tr><td colSpan={8} className="px-3 py-8 text-center text-neutral-500">
                No contracts yet. Accept an estimate and convert it, or create one from a customer profile.
              </td></tr>
            )}
            {contracts.map((c) => (
              // ROW = THE RECORD: the whole row opens THIS contract. The customer
              // name is deliberately not a link — "View customer profile" lives on
              // the contract's own detail page (§3.2).
              <RowLink key={c.id} href={`/contracts/${c.id}`}>
                <td className="px-3 py-2 font-medium text-brand">
                  {c.contract_number ?? "(no number)"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-neutral-700">{c.customer_code ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-700">{c.customer_name ?? "—"}</td>
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
              </RowLink>
            ))}
          </Tbody>
        </table>
      </TableWrap>
    </div>
  );
}
