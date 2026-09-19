# AGENTS.md

Browser SQL practice bench: a full SQLite engine (WASM) running in the page, with schema tools, CSV import, and a query journal. Architecture decisions carry LEARN ticket ids (grep the code comments); the decision and its rationale live in the learn-tool repo, not here.

## Verify loop

Run all three before committing; a step is done when its command exits clean:

```sh
npm test          # vitest, node environment
npm run typecheck # tsc --noEmit
npm run build     # tsc + vite build
```

## Architecture

- `src/bench-kit/` — pure logic, node-testable. Every module has a twin in `tests/` (e.g. `csv.ts` → `csv.test.ts`); new modules ship the same way.
- **Engine seam** (`bench-kit/engine.ts`) — the bench's only way to execute SQL. Adapters: `FakeEngine` (tests, node) and `WasmEngine` (sqlite-wasm worker, memory DB). Callers see `run(sql) → Outcome` and never SQLite's API.
- **Verbatim contract** — engine error messages pass through untouched; `error-help.ts` layers beginner explanations on top, and the journal stores the verbatim text for the agent feed.
- **Mount seam** (`src/app.ts`) — `mount(host, opts)` is the whole bench; `<sql-workbench>` (`sql-workbench.ts`) is the drop-in element wrapping it in a shadow root. Element ids are the contract between `BENCH_TEMPLATE` and `mount()`: a missing id throws at mount. `src/ui/` modules render behind mount — no wiring outside it.
- **Theme contract** (`bench-kit/theme.ts`, LEARN-224) — the shared `pharos_theme` key holds the host's mode. Embedded benches read it and never write it; standalone chrome persists through `persistSharedTheme`. The embed surface relays exactly one message, `{ type: "theme", theme: "dark" | "light" }` — new embed behavior extends `theme.ts` so the contract stays in one place.
- `src/docs.ts` — Pages-only page chrome (copy buttons, URL params, header theme toggle, mobile section menu). Marker elements in `index.html` are its contract: scope guards keep it inert when a marker is missing, and a contract mismatch warns rather than shipping silent breakage.

## Standing constraints

1. **No cross-origin isolation.** The bundle must run without SharedArrayBuffer or COOP/COEP headers — GitHub Pages can't set them (LEARN-194 era decision). The memory-DB choice exists to satisfy this.
2. **One dist, two surfaces.** The same build serves GitHub Pages (`/sql-workbench/`) and the vendored Pharos asset path (`/api/lesson-html/{ws}/assets/sql-workbench/`). `base: "./"` in `vite.config.ts` is what makes that work — new asset references stay relative.
3. **Wasm resolves by module URL.** `@sqlite.org/sqlite-wasm` stays out of `optimizeDeps`; pre-bundling breaks its `.wasm` lookup.
4. **URL params, no routing.** `appType: "mpa"` keeps static hosting honest (missing files 404). State lives in query params, not paths.

## Pages & releases

- `pages.yml` deploys the docs site on every push to `main` — but it downloads the **latest released** `sql-workbench.js`. Component changes (`app.ts`, `bench-kit/`, `ui/`) reach the Pages site only after a release; docs changes (`docs.ts`, `index.html`) ship on the push itself. `npm run build:docs` assembles `dist/` (`scripts/build-pages.mjs` string-matches the dev script entries in `index.html` — drift throws). Local check: `npm run build:docs`, then `npx vite preview`.
- `release.yml` (push a `v*` tag) runs the verify loop, builds the single file, and attaches it to the release. `dist/sql-workbench.js` is tracked because jsDelivr serves the repo tree — release commits include it.

## Conventions

- Commits follow conventional prefixes (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`) with the LEARN ticket when one exists.
