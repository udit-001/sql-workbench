# AGENTS.md

Browser SQL practice bench: a full SQLite engine (WASM) running in the page, with schema tools, CSV import, and a query journal. Decisions and their rationale live in `docs/research/` — read the relevant one before changing what it decided.

## Verify loop

Run all three before committing; a step is done when its command exits clean:

```sh
npm test          # vitest, node environment
npm run typecheck # tsc --noEmit
npm run build     # tsc + vite build
```

CI runs these only on tag builds, so the local loop is the only gate on `main`.

## Architecture

- `src/bench-kit/` — pure logic, node-testable. Every module has a twin in `tests/` (e.g. `csv.ts` → `csv.test.ts`); new modules ship the same way.
- **Engine seam** (`bench-kit/engine.ts`) — the bench's only way to execute SQL. Adapters: `FakeEngine` (tests, node) and `WasmEngine` (sqlite-wasm in a dedicated worker, memory DB). Callers see `run(sql) → Outcome` and never SQLite's API.
- **Verbatim contract** — engine error messages pass through untouched. `error-help.ts` layers beginner explanations on top; the journal stores the verbatim text for the agent feed. Normalizing a message breaks both consumers.
- `src/ui/` — DOM modules wired by `main.ts`, the single wiring point. Element ids are the contract between `index.html` and `main.ts`: a missing id throws at startup.
- **Embed surface** (`?mode=card`) — the host relays exactly one message, `{ type: "theme", theme: "dark" | "light" }` (`bench-kit/theme.ts`). New embed behavior extends that module so the contract stays in one place.

## Standing constraints

1. **No cross-origin isolation.** The bundle must run without SharedArrayBuffer or COOP/COEP headers — GitHub Pages can't set them (see `docs/research/deployment-distribution.md`). The memory-DB choice exists to satisfy this.
2. **One dist, two surfaces.** The same build serves GitHub Pages (`/sql-workbench/`) and the vendored Pharos asset path (`/api/lesson-html/{ws}/assets/sql-workbench/`). `base: "./"` in `vite.config.ts` is what makes that work — new asset references stay relative.
3. **Wasm resolves by module URL.** `@sqlite.org/sqlite-wasm` stays out of `optimizeDeps`; pre-bundling breaks its `.wasm` lookup.
4. **URL params, no routing.** `appType: "mpa"` keeps static hosting honest (missing files 404). State lives in query params, not paths.

## Conventions

- Commits follow conventional prefixes (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`) with the LEARN ticket when one exists.
- Version bumps ship as a `v*` tag; the tag triggers `.github/workflows/deploy.yml`, which publishes Pages and attaches `sql-workbench-asset.zip` to the release.
