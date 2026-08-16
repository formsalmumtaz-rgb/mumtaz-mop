import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";

// The commit this build was made from — shown in the app footer so a phone can
// PROVE which build it is running (stale-cache disputes end here). Baked at
// build time; "dev" when git is unavailable.
const COMMIT = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "dev"; }
})();

// Offline-first PWA. The service worker precaches the whole app shell so the app
// loads and runs with zero network (Constitution Art. III P1).
export default defineConfig({
  define: { __APP_COMMIT__: JSON.stringify(COMMIT) },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Mumtaz Field",
        short_name: "MOP Field",
        description: "Mumtaz technician field app",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#A31E22",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "index.html",
        // A stale precache is how a phone ends up showing an old build — or, if
        // the cached shell points at bundles that no longer exist, a BLANK
        // SCREEN. These three lines make an update self-healing: drop caches
        // from older revisions, activate the new worker immediately, and take
        // over the open tab without waiting for every tab to close.
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: { enabled: true },
    }),
  ],
  // Same-origin API: the app calls /api/... on its own origin, and the dev/preview
  // server proxies that to the LOCAL ops-console (never exposed to the internet).
  // When tunnelling the field app, the admin console stays on localhost only.
  server: {
    port: 3200,
    proxy: { "/api/field": { target: "http://localhost:3100", changeOrigin: true } },
    // allow the ephemeral cloudflared/ngrok hostname to reach the dev server
    allowedHosts: true,
  },
  preview: {
    port: 3200,
    proxy: { "/api/field": { target: "http://localhost:3100", changeOrigin: true } },
    allowedHosts: true,
  },
});
