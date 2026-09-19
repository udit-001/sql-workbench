/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Relative base + fixed chunk names: one dist serves GitHub Pages AND
  // jsDelivr (cdn.jsdelivr.net/gh/...@tag/dist/sql-workbench.js) AND the
  // vendored Pharos asset path (LEARN-194, superseded to component-only).
  base: "./",
  build: {
    // Single-file contract: the sqlite worker ships as a blob and the wasm
    // rides along as base64 inside sql-workbench.js — zero side requests.
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        entryFileNames: "sql-workbench.js",
        chunkFileNames: "sql-workbench.js",
        assetFileNames: "[name][extname]",
        inlineDynamicImports: true,
      },
    },
  },
  // No client-side routing (URL params only): serve plain files so missing
  // fixtures 404 honestly in dev/preview, like they will on Pages/static hosts.
  appType: "mpa",
  // @sqlite.org/sqlite-wasm resolves its .wasm asset relative to its own
  // module URL; pre-bundling breaks that, so keep it out of esbuild's graph.
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
