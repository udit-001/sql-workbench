# SQL Workbench

**Practice SQL in your browser. Real SQLite, no install, no account — your data never leaves the tab.**

| Light | Dark |
| --- | --- |
| ![SQL Workbench, light theme](docs/screenshots/bench-light.png) | ![SQL Workbench, dark theme](docs/screenshots/bench-dark.png) |

## What you get

- **Write and run real SQL** — a full SQLite engine compiled to WebAssembly runs in the page. Window functions, CTEs, joins: it's SQLite, not a toy parser.
- **Learn from your mistakes** — errors are explained in plain language, and mistype a column (`c.regio`) and it asks if you meant `region`.
- **See the schema before you guess** — a sidebar lists every table and column (click to insert at the caret), and a diagram draws the tables with their foreign-key graph.
- **Bring your own data** — import a CSV and query it like any other table. A sample e-commerce dataset (customers → orders → products) is built in.
- **Keep a query journal** — every run is saved to history in your browser. Export the whole session as Markdown when you're done.
- **Embed it anywhere** — `?mode=card` collapses the workbench into an embeddable card that picks up the host page's theme.

Everything runs client-side: the database lives in memory in your tab and the journal lives in IndexedDB. No server, no telemetry.

## Running it

There's no hosted deployment yet, so it runs from source:

```sh
npm install
npm run dev
```

Other scripts: `npm test` (vitest), `npm run typecheck`, `npm run build`.

## How it's built

Vite + TypeScript, with `@sqlite.org/sqlite-wasm` as the only runtime dependency. The engine, journal, CSV parser, and error explainer live in `src/bench-kit/` as small, independently tested modules.
