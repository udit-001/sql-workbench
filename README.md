# SQL Workbench

**Practice SQL in your browser. Real SQLite, no install, no account — your data never leaves the tab.**

| Light | Dark |
| --- | --- |
| ![SQL Workbench, light theme](docs/screenshots/bench-light.png) | ![SQL Workbench, dark theme](docs/screenshots/bench-dark.png) |

## Quick start

```html
<script type="module"
        src="https://cdn.jsdelivr.net/gh/udit-001/sql-workbench@v0.3/dist/sql-workbench.js"></script>

<sql-workbench namespace="my-app" style="display:block;height:560px"></sql-workbench>
```

One script, one element. ~1.5 MB (614 KB gzipped), zero side requests — the SQLite engine is inside it. Or download `sql-workbench.js` from the [releases](https://github.com/udit-001/sql-workbench/releases) and serve it yourself.

## What you get

- **Run real SQL** — full SQLite via WebAssembly. Window functions, CTEs, joins.
- **Learn from mistakes** — errors explained in plain language; mistyped columns get suggestions.
- **See the schema** — sidebar lists tables and columns; diagram draws foreign-key relationships.
- **Import CSVs** — drag a file, query it like any table. persisted across sessions.
- **Keep a journal** — every run saved to history; export as Markdown when done.
- **Drop into any page** — single-file web component, follows the host theme.

## Attributes

| Attribute | Value | Notes |
| --- | --- | --- |
| `mode` | `card` | drill variant: editor + Run/Reset only |
| `theme` | `light` \| `dark` | override; omit to follow host page |
| `namespace` | any name | private journal + imported tables |
| `dataset` | fixture id | load a named dataset (see below) |
| `sql` | SQL text | boot-time editor prefill |
| `autofocus` | boolean | focus editor after boot; off by default |

## Fixtures

A fixture is a JSON file that seeds the bench with tables and data. Create one at `fixtures/<id>.json`, load it with `dataset="<id>"`.

```json
{
  "id": "ecommerce",
  "kind": "sqlite-dataset",
  "version": 1,
  "title": "E-commerce sample",
  "description": "Customers, orders, products.",
  "reset": {
    "sql": "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO customers VALUES (1, 'Ada Lovelace');"
  }
}
```

The `id` must match the filename stem. The `reset.sql` runs on every load and Reset — keep it idempotent. Seed SQL stays plain and readable; no base64.

## API

```js
const bench = document.querySelector("sql-workbench");

await bench.run("SELECT * FROM orders LIMIT 5");  // → Outcome, journaled
await bench.reset();                               // re-seed the dataset
const md = await bench.exportMarkdown();           // session journal as Markdown
const events = await bench.events();               // journal entries, newest first
bench.setTheme("dark");

bench.addEventListener("workbench-event", (e) => {
  // e.detail: { type: "query" | "dataset-reset" | "csv-import" | "csv-import-removed", ... }
});
```

## Theming

Three layers:

1. **Auto-adapt** — follows host `html[data-theme]`, OS `prefers-color-scheme`, or a `{ type: "theme" }` postMessage. Embedded benches never write your theme keys.
2. **Token overrides** — every token is a `--wb-*` custom property on the element:

   ```css
   sql-workbench {
     --wb-bg: #24283b; --wb-surface: #1f2335; --wb-accent: #bb9af7;
     --wb-text: #c0caf5; --wb-heading: #7aa2f7; --wb-border: #414868;
   }
   ```

3. **Parts** — `editor`, `run-button`, `reset-button`, `results`, `schema`, `diagram`, `history`, `statusbar`.

## Data & privacy

Everything runs client-side: SQLite in memory, journal and imported CSVs in IndexedDB under your `namespace`. No server, no telemetry.

## Development

```sh
npm install
npm run dev             # localhost:5173
npm test                # vitest
npm run typecheck       # tsc --noEmit
npm run build           # dist/ = demo + single-file component + fixtures
```

Architecture details in [AGENTS.md](AGENTS.md).
