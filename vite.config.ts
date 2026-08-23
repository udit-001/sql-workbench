/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
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
