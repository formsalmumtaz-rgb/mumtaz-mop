"use server";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createEstimate } from "@/lib/domain/estimation";

// Phase 4 — carry a drafted scope into a REAL estimate. The draft is content
// only: it lands in the estimate's notes, the estimate is created as a DRAFT
// with no lines and no prices, and the office prices it through the normal
// engines. Nothing Claude wrote can become a number on a customer document.
export async function createEstimateFromDraftAction(fd: FormData): Promise<void> {
  await requirePermission("estimate.edit");
  const intro = String(fd.get("intro") ?? "").trim();
  const scope = fd.getAll("scope").map(String).filter(Boolean);
  const lines = fd.getAll("line").map(String).filter(Boolean);
  if (!intro && scope.length === 0 && lines.length === 0) redirect("/assistant");

  const notes = [
    "— Drafted by the assistant, not yet priced. Review the wording before it reaches a customer. —",
    "",
    intro,
    scope.length ? "\nScope of work:\n" + scope.map((s) => `• ${s}`).join("\n") : "",
    lines.length ? "\nProposed line items (descriptions only — price each through the estimate engine):\n"
      + lines.map((l, i) => `${i + 1}. ${l}`).join("\n") : "",
  ].filter(Boolean).join("\n");

  const tenantId = await getTenantId();
  const id = await createEstimate(tenantId, await getServiceLineId(tenantId), { notes });
  redirect(`/estimates/${id}`);
}
