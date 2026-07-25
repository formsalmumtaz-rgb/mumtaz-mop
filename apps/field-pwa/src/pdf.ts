import { jsPDF } from "jspdf";
import logoUrl from "./assets/pest-logo.png";
import type { LocalJob, MediaItem } from "./db";

const BRAND = "#A31E22";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

// Render Arabic on a canvas so the BROWSER shapes the RTL text correctly (jsPDF
// cannot shape Arabic), then embed it as an image. Fully offline.
function arabicImage(lines: string[]): { dataUrl: string; ratio: number } {
  const scale = 3;
  const logicalW = 900;
  const logicalH = lines.length * 40 + 20;
  const canvas = document.createElement("canvas");
  canvas.width = logicalW * scale;
  canvas.height = logicalH * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#171717";
  ctx.textAlign = "right";
  ctx.direction = "rtl";
  ctx.font = "600 26px system-ui, 'Noto Naskh Arabic', sans-serif";
  lines.forEach((l, i) => ctx.fillText(l, logicalW - 10, 30 + i * 40));
  return { dataUrl: canvas.toDataURL("image/png"), ratio: logicalH / logicalW };
}

// On-device service report. Runs fully offline: jsPDF, the cached logo, the
// signature blob, and canvas-shaped Arabic all work with no network.
export async function generateServiceReport(job: LocalJob, media: MediaItem[]): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 40;

  try {
    const logo = await loadImage(logoUrl);
    const w = 120;
    doc.addImage(logo, "PNG", 40, y, w, (logo.height / logo.width) * w);
  } catch {
    /* logo optional */
  }

  doc.setTextColor(BRAND);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Service Report", W - 40, y + 24, { align: "right" });
  doc.setTextColor("#171717");
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Mumtaz Integrated Services Group — Pest Control", W - 40, y + 42, { align: "right" });
  y += 110;

  doc.setDrawColor("#e5e5e5");
  doc.line(40, y, W - 40, y);
  y += 20;

  const row = (label: string, val: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, 40, y);
    doc.setFont("helvetica", "normal");
    doc.text(val, 180, y);
    y += 18;
  };
  row("Customer", job.customer_name);
  row("Site", job.branch_name ?? "-");
  row("Address", job.address ?? "-");
  row("Date", job.device_completed_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  if (job.lat != null) row("GPS", `${job.lat.toFixed(5)}, ${job.lng?.toFixed(5)}`);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Checklist", 40, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  Object.entries(job.checklist ?? {}).forEach(([k, v]) => {
    doc.text(`${v ? "[x]" : "[ ]"}  ${k}`, 48, y);
    y += 16;
  });
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Chemicals used", 40, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.text(job.recipe ? job.recipe.name : "No treatment recipe configured for this job.", 48, y);
  y += 24;

  const sig = media.find((m) => m.kind === "signature");
  doc.setFont("helvetica", "bold");
  doc.text("Customer signature", 40, y);
  y += 8;
  if (sig) {
    try {
      const im = await loadImage(URL.createObjectURL(sig.blob));
      doc.addImage(im, "PNG", 40, y, 160, 60);
    } catch {
      /* signature optional */
    }
  }
  y += 78;

  // Arabic RTL section (browser-shaped, embedded as an image)
  const ar = arabicImage(["تقرير خدمة مكافحة الآفات", "شكراً لتعاملكم مع مجموعة الممتاز للخدمات المتكاملة"]);
  const arW = W - 80;
  doc.addImage(ar.dataUrl, "PNG", 40, y, arW, arW * ar.ratio);

  return doc.output("blob");
}
