import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getTenantId } from "@/lib/tenant";
import { requirePermission } from "@/lib/auth";
import { DATASETS, runExport } from "@/lib/exports";
import { resolveDocumentBrandOrg } from "@/lib/domain/branding";
import { renderListPdf, pngSize, type Asset } from "@mop/documents";

// Export any console list as Excel or PDF, with the page's own filters applied.
// The filters arrive as the same query params the page uses, so "export" always
// means "this list, as I am looking at it".
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadLogo(): Promise<Asset | null> {
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "public", "brand", "mumtaz-isg.png"));
    const { w, h } = pngSize(buf);
    return { dataUrl: `data:image/png;base64,${buf.toString("base64")}`, w, h };
  } catch {
    return null; // renders with the title alone
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await ctx.params;
  const ds = DATASETS[dataset];
  if (!ds) return NextResponse.json({ error: "unknown dataset" }, { status: 404 });
  try {
    await requirePermission(ds.permission);
  } catch {
    return NextResponse.json({ error: "not permitted" }, { status: 403 });
  }

  const url = new URL(req.url);
  const sp: Record<string, string | undefined> = {};
  url.searchParams.forEach((v, k) => { sp[k] = v; });
  const format = sp.format === "pdf" ? "pdf" : "xlsx";
  const tenantId = await getTenantId();
  const { title, columns, rows, describe } = await runExport(tenantId, dataset, sp);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${dataset}-${stamp}.${format}`;

  if (format === "pdf") {
    const [logo, org] = await Promise.all([loadLogo(), resolveDocumentBrandOrg(tenantId)]);
    const legal = [org.legal_name, org.trade_licence ? `TL ${org.trade_licence}` : null]
      .filter(Boolean).join(", ");
    const pdf = renderListPdf({
      title, subtitle: describe, columns, rows,
      generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      logo, legalLine: legal,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const mod = (await import("exceljs")) as unknown as { default?: unknown };
  const ExcelJS = (mod.default ?? mod) as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mumtaz Operations Platform";
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8A1E2E" } };
  for (const r of rows) ws.addRow(r);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  // The filters that produced this file, recorded on the sheet — an exported
  // list with no record of its filters is a number without provenance.
  const note = ws.addRow({});
  note.getCell(1).value = `Filters: ${describe} · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  note.getCell(1).font = { italic: true, color: { argb: "FF8C8781" }, size: 9 };

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
