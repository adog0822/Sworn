import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds into ../dist, which the Worker serves as static assets. Dev proxies the API to the live Worker.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    port: 5180,
    proxy: {
      "/api": { target: "https://sworn.loxeai-evt.workers.dev", changeOrigin: true },
      "/.well-known": { target: "https://sworn.loxeai-evt.workers.dev", changeOrigin: true },
    },
  },
});
