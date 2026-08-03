import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getServiceReport } from "@/lib/domain/servicereports";
import { reviewServiceReportAction, addAttachmentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ServiceReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const data = await getServiceReport(tenantId, id);
  if (!data) notFound();
  const { header, reviews, attachments } = data;
  const notes = (header.snapshot?.notes as string) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/service-reports" className="text-sm text-brand underline">← Service reports</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            <span className="font-mono">{header.report_number ?? "—"}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${header.review_action === "approved" ? "bg-emerald-100 text-emerald-800" : header.review_action === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{header.review_action ?? "pending"}</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {header.customer ?? "—"}{header.performer && <> · by {header.performer}</>}
            {header.server_completed_at && <> · {header.server_completed_at.slice(0, 10)}</>}
          </p>
          {notes && <p className="mt-2 text-sm text-neutral-700">{notes}</p>}
        </div>
        <div className="flex gap-2">
          <form action={reviewServiceReportAction}><input type="hidden" name="sr_id" value={header.id} /><input type="hidden" name="action" value="approved" />
            <button className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Approve</button></form>
          <form action={reviewServiceReportAction}><input type="hidden" name="sr_id" value={header.id} /><input type="hidden" name="action" value="rejected" />
            <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">Reject</button></form>
        </div>
      </div>

      {/* Attachments */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Attachments <span className="text-neutral-400">({attachments.length})</span></h2>
        <div className="mb-3 space-y-1">
          {attachments.length === 0 && <p className="text-sm text-neutral-500">No photos, signature, or documents attached yet.</p>}
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded border border-neutral-200 px-3 py-1.5 text-sm">
              <span><span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{a.kind}</span> <span className="ml-2 text-neutral-600">{a.caption ?? a.storage_key}</span></span>
              <span className="font-mono text-xs text-neutral-400">{a.storage_key}</span>
            </div>
          ))}
        </div>
        <form action={addAttachmentAction} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input type="hidden" name="sr_id" value={header.id} />
          <select name="kind" className="rounded border border-neutral-300 px-2 py-1.5 text-sm"><option value="photo">Photo</option><option value="signature">Signature</option><option value="document">Document</option></select>
          <input name="storage_key" placeholder="R2 object key" className="rounded border border-neutral-300 px-2 py-1.5 text-sm sm:col-span-2" />
          <input name="caption" placeholder="Caption (optional)" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 sm:col-span-4 sm:w-auto sm:justify-self-start">Attach</button>
        </form>
        <p className="mt-2 text-xs text-neutral-500">Attachments are permanent (append-only). File upload to R2 is wired in the field-app track; keys can be recorded here in the interim.</p>
      </section>

      {/* Review history */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Approval history</h2>
        {reviews.length === 0 && <p className="text-sm text-neutral-500">Not yet reviewed.</p>}
        <ul className="space-y-1 text-sm">
          {reviews.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.action === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{r.action}</span>
              <span className="text-neutral-500">{r.created_at.slice(0, 19).replace("T", " ")}</span>
              {r.note && <span className="text-neutral-700">— {r.note}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
