# Research: SQLite WASM engine pick

Ticket: LEARN-193 · Resolved: `@sqlite.org/sqlite-wasm`, in-memory DB, own worker

## Decision

Use **`@sqlite.org/sqlite-wasm`** (currently 3.53.x — tracks upstream SQLite releases) with an **in-memory database** inside a dedicated worker we own. `sql.js` documented as the fallback if integration friction appears.

## Why

1. **Teaching fidelity is the tiebreaker.** A SQL teaching tool must speak *current* SQLite. The official package rebuilds on every upstream tag (3.41 → … → 3.53 continuously since 2023). sql.js catches up in waves — it sat on 3.45 for a long stretch before jumping to 3.49 (v1.13.0), then continued. Lag here means teaching stale syntax.
2. **Maintenance authority.** Built by the SQLite team; the npm distribution is acknowledged on sqlite.org itself. sql.js is community-maintained.
3. **We need zero DB persistence**, so the scary parts of the official package don't apply: no OPFS VFS, no COOP/COEP, no SharedArrayBuffer. Plain memory DB needs nothing special from the host — works identically on GitHub Pages and inside Pharos's local server.
4. **API ergonomics are irrelevant behind the Engine seam** (`run(sql) → Outcome`). Callers never see sqlite3's oo1 API, so sql.js's simpler `.exec()` buys nothing.

## Architecture sketch

```text
main thread                    worker (ours)
───────                        ─────────────
engine.run(sql) ──post──►  init sqlite3 once (memoized)
                           db = new DB(':memory:')   // per fixture reset:
fixture.load(json) ──►     close + recreate + exec seed statements
                     ◄──post── { columns, rows(ms-capped), ms, error }
```

- Row cap enforced in the worker (grid shows "N of M").
- Reset determinism: fixture seed SQL is the single source of truth — same input, same database, every time.
- Errors surface verbatim (`sqlite3` messages) — the journal feeds them to the agent.

## Why not sql.js (and fallback clause)

- Version lag waves (above); smaller but less current core.
- 2.1M weekly downloads vs 631K — popularity noted, not decisive for a teaching tool.
- **Fallback:** if official-package bundling/init friction blocks v1 (it has had "bundler-friendly" fixes landing), swap to sql.js v1.14.x behind the same Engine interface — one adapter file changes.

## Sources

- [npm @sqlite.org/sqlite-wasm](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm) — versioning scheme tracks SQLite tags
- [SQLite WASM persistence docs](https://sqlite.org/wasm/doc/trunk/persistence.md) — OPFS VFS variants, SAB/COOP-COEP requirements (avoided)
- [sql.js v1.13.0 release](https://github.com/sql-js/sql.js/releases/tag/v1.13.0) — core upgrade history showing wave-lag
- [sql.js on npm](https://registry.npmjs.org/sql.js) — adoption numbers
