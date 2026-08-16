import { NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";
import { requirePermission, getSession } from "@/lib/auth";
import { askBusiness, draftQuotationContent } from "@/lib/assistant";

// Item 5 — the owner's assistant endpoint. Admin only (settings.manage), rate
// of use is human-scale (a chat box), read-only by construction.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    await requirePermission("settings.manage");
  } catch {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }
  const tenantId = await getTenantId();
  const session = await getSession();
  const body = (await req.json().catch(() => ({}))) as { mode?: string; question?: string };
  const question = (body.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "empty question" }, { status: 400 });
  if (question.length > 4000) return NextResponse.json({ error: "question too long" }, { status: 400 });

  try {
    if (body.mode === "draft_quotation") {
      const r = await draftQuotationContent(tenantId, session?.userId ?? null, question);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 503 });
      return NextResponse.json({ draft: r.draft });
    }
    const r = await askBusiness(tenantId, session?.userId ?? null, question);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 503 });
    return NextResponse.json({ answer: r.answer });
  } catch (e) {
    console.error("[assistant]", (e as Error).message);
    return NextResponse.json({ error: "assistant failed: " + (e as Error).message }, { status: 500 });
  }
}
