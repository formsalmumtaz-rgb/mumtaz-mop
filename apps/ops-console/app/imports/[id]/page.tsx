import Link from "next/link";
import { notFound } from "next/navigation";
import { requireView } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { getImportBatch } from "@/lib/domain/imports";
import { Card, CardBody, Badge, PageHeader, TableWrap, Thead, Tbody, Button } from "@/components/ui";
import { commitImportAction, abandonImportAction } from "../actions";

export const dynamic = "force-dynamic";

const DISP_TONE: Record<string, "neutral" | "navy" | "success" | "warning" | "danger"> = {
  clean: "success", held: "warning", rejected: "danger", matched_live: "navy", committed: "success", pending: "neutral",
};

// The staging tables have no 'committed' disposition for customer rows, so a
// committed batch still reads 'clean' — the wording has to come from the batch
// status, or the report would keep promising to create rows it already created.
const EXPLAIN = (disposition: string, committed: boolean): string => ({
  clean: committed ? "created in the live system" : "will be created when you approve",
  held: "needs your decision — nothing was created",
  rejected: "cannot be imported as it stands",
  matched_live: "already in the system — not duplicated",
  committed: "created in the live system",
}[disposition] ?? "");

export default async function ImportBatchPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireView("settings.manage");
  const { id } = await params;
  const sp = await searchParams;
  const detail = await getImportBatch(await getTenantId(), id);
  if (!detail) notFound();
  const { batch, breakdown, rows } = detail;

  const customerCounts = breakdown.filter((b) => b.table === "customers");
  const total = (d: string) => customerCounts.filter((b) => b.disposition === d).reduce((s, b) => s + b.n, 0);
  const clean = total("clean");
  const committed = batch.status === "committed";
  const canCommit = batch.status === "validated" && clean > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import validation report"
        description={`${batch.source} · staged ${batch.created_at.slice(0, 16).replace("T", " ")}`}
        actions={<Link href="/imports" className="text-sm text-brand underline">← All imports</Link>}
      />

      {sp.committed && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Committed. The clean rows are now live customers — find them in the customer list, each flagged for you to confirm.
        </div>
      )}
      {sp.error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{sp.error}</div>}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Badge tone={committed ? "success" : batch.status === "abandoned" ? "danger" : "warning"}>{batch.status}</Badge>
            <span className="text-sm text-neutral-600">
              {clean} row(s) would be created · {total("held")} held · {total("rejected")} rejected · {total("matched_live")} already known
            </span>
          </div>

          {canCommit ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-4">
              <form action={commitImportAction}>
                <input type="hidden" name="id" value={batch.id} />
                <Button type="submit">Approve and create {clean} customer(s)</Button>
              </form>
              <form action={abandonImportAction}>
                <input type="hidden" name="id" value={batch.id} />
                <button className="text-sm text-neutral-500 underline hover:text-red-600">Abandon this batch</button>
              </form>
              <p className="text-xs text-neutral-500">
                Only the clean rows are created. Held and rejected rows are never written — fix the file and upload it again.
              </p>
            </div>
          ) : (
            <p className="border-t border-neutral-100 pt-4 text-sm text-neutral-500">
              {committed
                ? "This batch has been committed. Committed records are corrected in the customer screens, not by re-importing."
                : batch.status === "abandoned"
                  ? "This batch was abandoned. Nothing from it was written to the live system."
                  : "Nothing in this batch is clean, so there is nothing to create. Fix the file and upload it again."}
            </p>
          )}
        </CardBody>
      </Card>

      <div>
        <h2 className="mb-2 font-medium">What the check found</h2>
        <TableWrap>
            <Thead>
              <tr>
                <th className="px-3 py-2 text-left font-medium">Record type</th>
                <th className="px-3 py-2 text-left font-medium">Outcome</th>
                <th className="px-3 py-2 text-left font-medium">Reason</th>
                <th className="px-3 py-2 text-right font-medium">Rows</th>
              </tr>
            </Thead>
            <Tbody>
              {breakdown.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-neutral-500">Nothing staged.</td></tr>}
              {breakdown.map((b, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 capitalize">{b.table}</td>
                  <td className="px-3 py-2">
                    <Badge tone={DISP_TONE[b.disposition] ?? "neutral"}>{b.disposition.replace("_", " ")}</Badge>
                    <span className="ml-2 text-xs text-neutral-500">{EXPLAIN(b.disposition, committed)}</span>
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{b.reason || "—"}</td>
                  <td className="px-3 py-2 text-right">{b.n}</td>
                </tr>
              ))}
            </Tbody>
          </TableWrap>
      </div>

      <div>
        <h2 className="mb-2 font-medium">Row by row {rows.length >= 400 && <span className="text-xs font-normal text-neutral-500">(first 400)</span>}</h2>
        <TableWrap>
            <Thead>
              <tr>
                <th className="px-3 py-2 text-left font-medium">Row</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">TRN</th>
                <th className="px-3 py-2 text-left font-medium">Emirate</th>
                <th className="px-3 py-2 text-left font-medium">Outcome</th>
                <th className="px-3 py-2 text-left font-medium">Why</th>
              </tr>
            </Thead>
            <Tbody>
              {rows.map((r) => (
                <tr key={r.source_row_id}>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">{r.source_row_id}</td>
                  <td className="px-3 py-2">{r.name ?? <span className="text-red-600">no name</span>}</td>
                  <td className="px-3 py-2 text-neutral-600">{r.trn ?? "N/A"}</td>
                  <td className="px-3 py-2 text-neutral-600">{r.emirate ?? "N/A"}</td>
                  <td className="px-3 py-2"><Badge tone={DISP_TONE[r.disposition] ?? "neutral"}>{r.disposition.replace("_", " ")}</Badge></td>
                  <td className="px-3 py-2 text-neutral-600">{r.reason ?? "—"}</td>
                </tr>
              ))}
            </Tbody>
          </TableWrap>
      </div>
    </div>
  );
}
