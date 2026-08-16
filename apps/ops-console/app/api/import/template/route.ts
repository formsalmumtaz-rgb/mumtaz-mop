import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { importTemplateCsv } from "@/lib/domain/imports";

// The customer import template — the column names the uploader understands,
// with one example row so the shape is obvious without reading documentation.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission("settings.manage");
  } catch {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }
  return new NextResponse(importTemplateCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="mumtaz-customer-import-template.csv"',
    },
  });
}
