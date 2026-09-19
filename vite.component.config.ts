/// <reference types="vitest/config" />
import { defineConfig } from "vite";

/**
 * Component build (LEARN-194 single-file contract): the entire bench —
 * JS, CSS, sqlite worker, and the wasm binary — inlines into ONE file
 * (spike-proven; ~1.6 MB / ~630 KB gzip). Consumers serve it from any
 * origin/CDN: <script type="module"> + <sql-workbench>.
 */
export default defineConfig({
  appType: "custom",
  base: "./",
  publicDir: false, // fixtures ship in the standalone dist only; the component is self-contained
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  build: {
    outDir: "dist-component",
    emptyOutDir: true,
    lib: {
      entry: "src/sql-workbench.ts",
      name: "sql-workbench",
      formats: ["es"],
      fileName: () => "sql-workbench.js",
    },
    assetsInlineLimit: 100_000_000, // inline the wasm as base64
    rollupOptions: {
      output: { inlineDynamicImports: true }, // single file, no chunks
    },
  },
});
