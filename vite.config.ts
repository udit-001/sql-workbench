/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
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
