import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Offline-first PWA. The service worker precaches the whole app shell so the app
// loads and runs with zero network (Constitution Art. III P1).
export default defineConfig({
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
      },
      devOptions: { enabled: true },
    }),
  ],
  server: { port: 3200 },
  preview: { port: 3200 },
});
