/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Relative base: one dist serves GitHub Pages (/sql-workbench/) AND the
  // vendored Pharos asset path (/api/lesson-html/{ws}/assets/sql-workbench/)
  // per docs/research/deployment-distribution.md.
  base: "./",
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
