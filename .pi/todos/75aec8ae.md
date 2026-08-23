{
  "id": "75aec8ae",
  "title": "LEARN-201: Bench kernel + runnable SQL app",
  "tags": [],
  "status": "open",
  "created_at": "2026-08-23T04:38:09.050Z"
}

Implement LEARN-201 in /home/udit/Dev/personal/sql-workbench.

## Plan
1. Scaffold Vite+TS project (package.json, tsconfig, vite.config, index.html, .gitignore, git init)
2. TDD Engine seam: Outcome types + FakeEngine + outcome factories
3. TDD Bench orchestrator (DOM-free BenchUi port) driven by FakeEngine
4. TDD worker RPC wrapper (correlation, error propagation) with mock worker
5. Implement sqlite.worker.ts (@sqlite.org/sqlite-wasm oo1, memory DB) + WasmEngine adapter
6. Demo dataset (mini ecommerce, deterministic, contains NULLs) + Nord token CSS + index.html shell (FOUC pharos_theme) + main.ts wiring (editor, Ctrl/Cmd+Enter, Run button, results grid w/ NULL + rows/ms/cap, topbar chip + theme toggle)
7. Typecheck + full unit suite
8. Build + live Playwright verification (AC: typing SELECT + Enter renders correct rows from seeded tables)
9. /code-review
10. Commit to current branch + update LEARN-201

## Acceptance criteria (from ticket)
- [ ] typing a SELECT and pressing Enter renders correct rows from seeded tables
- [ ] FakeEngine-backed unit tests cover orchestration without loading WASM

## Out of scope (later tickets)
202 fixture/?fixture=/schema panel/reset · 203 journal/history · 204 CSV · 205 card mode · 206-207 Pharos side
