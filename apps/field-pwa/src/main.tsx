import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

// Dev-only report design preview at ?preview=report. Guarded by import.meta.env.DEV
// AND loaded via dynamic import so the harness (pdf.js + its 1.4 MB worker) is
// dead-code-eliminated from the production bundle and never precached offline.
const isReportPreview =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("preview") === "report";

if (isReportPreview) {
  // No service worker in preview mode, so the PDF blob renders cleanly. Rendered
  // outside StrictMode: the double-invoke races the async pdf.js rasterisation.
  import("./report/Preview").then(({ ReportPreview }) => root.render(<ReportPreview />));
} else {
  // Register the service worker (precaches the app shell for offline load).
  registerSW({ immediate: true });
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
