import Link from "next/link";
import { requireView } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { listImportBatches } from "@/lib/domain/imports";
import { Card, CardBody, Badge, PageHeader, TableWrap, Thead, Tbody, Button } from "@/components/ui";
import { uploadImportAction } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<string, "neutral" | "navy" | "success" | "warning" | "danger"> = {
  staged: "neutral", validated: "warning", committed: "success", abandoned: "danger",
};

export default async function ImportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireView("settings.manage");
  const sp = await searchParams;
  const batches = await listImportBatches(await getTenantId());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import customers"
        description="Upload a customer list as CSV. Nothing is written to the live system on upload — the file is staged, checked row by row, and you see exactly what would be created before you approve it."
      />

      {sp.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{sp.error}</div>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div>
            <h2 className="font-medium">1. Get the template</h2>
            <p className="mt-1 text-sm text-neutral-600">
              The template has one example row showing what each column expects. Extra columns in your file are ignored and
              reported; the only requirement is a <code className="rounded bg-neutral-100 px-1">legal_name</code> or{" "}
              <code className="rounded bg-neutral-100 px-1">trade_name</code> column.
            </p>
            <a href="/api/import/template" className="mt-2 inline-block rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">
              Download the CSV template
            </a>
          </div>

          <div className="border-t border-neutral-100 pt-4">
            <h2 className="font-medium">2. Upload your file</h2>
            <p className="mt-1 text-sm text-neutral-600">
              You will land on a validation report showing which rows are clean, which are held for your decision, and why.
            </p>
            <form action={uploadImportAction} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="file" name="file" accept=".csv,text/csv" required
                className="text-sm file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm" />
              <Button type="submit">Check the file</Button>
            </form>
          </div>
        </CardBody>
      </Card>

      <div>
        <h2 className="mb-2 font-medium">Import batches</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-neutral-500">No imports yet. Upload a file above to create the first batch.</p>
        ) : (
          <TableWrap>
              <Thead>
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">Staged</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Rows</th>
                  <th className="px-3 py-2 text-right font-medium">Clean</th>
                  <th className="px-3 py-2 text-right font-medium">Held</th>
                  <th className="px-3 py-2 text-right font-medium">Rejected</th>
                  <th className="px-3 py-2 text-right font-medium">Already known</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </Thead>
              <Tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2">{b.source}</td>
                    <td className="px-3 py-2 text-neutral-500">{b.created_at.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-3 py-2"><Badge tone={TONE[b.status] ?? "neutral"}>{b.status}</Badge></td>
                    <td className="px-3 py-2 text-right">{b.customers}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{b.clean}</td>
                    <td className="px-3 py-2 text-right text-amber-700">{b.held}</td>
                    <td className="px-3 py-2 text-right text-red-700">{b.rejected}</td>
                    <td className="px-3 py-2 text-right text-neutral-500">{b.matched}</td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/imports/${b.id}`} className="text-brand underline">open</Link>
                    </td>
                  </tr>
                ))}
              </Tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
