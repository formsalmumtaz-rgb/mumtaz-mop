// Dev-only preview harness for the Service Completion Report. Renders the PDF
// (sample or empty-state) and rasterises each page to a canvas with pdf.js so the
// layout/DNA can be reviewed inline. Reached at ?preview=report. pdf.js is
// dynamically imported so it never enters the production field-app bundle.

import { useEffect, useRef, useState } from "react";
import logoUrl from "../assets/pest-logo.png";
import { buildSampleModel } from "./build";
import { DEFAULT_BOILERPLATE, type ReportModel } from "./model";
import { renderReport } from "./render";

// The lean "real data today" state: only what a completed job currently holds.
function buildLeanModel(): ReportModel {
  return {
    meta: { reportNo: "7F3A9C10", generatedAt: new Date().toISOString(), verifyUrl: "https://verify.almumtaz.ae/r/lean-demo" },
    identification: { jobNo: "7F3A9C10", serviceDate: "2026-07-24", timeIn: "09:15", timeOut: "10:40" },
    customer: { displayName: "Calicut Restaurant", branchName: "Aljada Branch", addressLine: "Al Estiqlal Street, Al Manakh, Sharjah" },
    team: {},
    findings: {},
    treatment: { chemicals: [{ product: "Cislin 2.5 EC", dilution: "1:50", dosage: "500 ml" }] },
    trend: { history: [] },
    boilerplate: DEFAULT_BOILERPLATE,
    signatures: {},
  };
}

async function renderToCanvases(blob: Blob, container: HTMLElement) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  container.innerHTML = "";
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = "min(820px, 96vw)";
    canvas.style.height = "auto";
    canvas.style.display = "block";
    canvas.style.margin = "0 auto 18px";
    canvas.style.boxShadow = "0 2px 14px rgba(0,0,0,.4)";
    container.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
  }
}

export function ReportPreview() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"sample" | "lean">("sample");
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    (async () => {
      setBusy(true);
      try {
        const model = mode === "sample" ? buildSampleModel() : buildLeanModel();
        const blob = await renderReport(model, { logoUrl });
        if (hostRef.current) await renderToCanvases(blob, hostRef.current);
        setErr("");
      } catch (e) {
        setErr((e as Error).stack ?? (e as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  }, [mode]);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#525659" }}>
      <div style={{ display: "flex", gap: 8, padding: 8, background: "#2b2b2b", alignItems: "center" }}>
        <button onClick={() => setMode("sample")} disabled={mode === "sample"}>Full sample</button>
        <button onClick={() => setMode("lean")} disabled={mode === "lean"}>Real data today (omit-empty)</button>
        <span style={{ color: "#ccc", fontSize: 12 }}>mode: {mode}{busy ? " · rendering…" : ""}</span>
      </div>
      {err ? (
        <pre style={{ color: "#ff8888", padding: 16, overflow: "auto", fontSize: 12 }}>{err}</pre>
      ) : (
        <div ref={hostRef} style={{ flex: 1, overflow: "auto", padding: 18 }} />
      )}
    </div>
  );
}
