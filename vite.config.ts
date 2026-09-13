/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],
  // MuPDF's WASM loader uses top-level await: keep ES module output for app and workers.
  build: { chunkSizeWarningLimit: 16000, target: "es2022" },
  worker: { format: "es" as const },
  optimizeDeps: { exclude: ["mupdf"] },

  // Tauri: don't obscure Rust errors; fixed dev port.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },

  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    alias: [
      // The modern pdfjs build targets browsers; Node tests use the legacy build.
      { find: /^pdfjs-dist$/, replacement: "pdfjs-dist/legacy/build/pdf.mjs" },
    ],
  },
}));
