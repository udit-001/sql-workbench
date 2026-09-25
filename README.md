# SQL Workbench

**Practice SQL in your browser. Real SQLite, no install, no account — your data never leaves the tab.**

| Light | Dark |
| --- | --- |
| ![SQL Workbench, light theme](docs/screenshots/bench-light.png) | ![SQL Workbench, dark theme](docs/screenshots/bench-dark.png) |

**Just want to practice?** [Open the standalone bench](https://udit-001.github.io/sql-workbench/standalone.html) — starts empty, bookmark it.

## Quick start

```html
<script type="module"
        src="https://cdn.jsdelivr.net/gh/udit-001/sql-workbench@v0.7/dist/sql-workbench.js"></script>

<sql-workbench namespace="my-app" style="display:block;height:560px"></sql-workbench>
```

One script, one element. ~1.5 MB (614 KB gzipped), zero side requests — the SQLite engine is inside it. Or download `sql-workbench.js` from the [releases](https://github.com/udit-001/sql-workbench/releases) and serve it yourself.

## What you get

- **Run real SQL** — full SQLite via WebAssembly. Window functions, CTEs, joins.
- **Learn from mistakes** — errors explained in plain language; mistyped columns get suggestions.
- **Verify attempts** — pose problems with a `test`; every attempt gets a pass/miss verdict.
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
| `test` | JSON rows | graded problem slot; attempts are compared against these rows — order-insensitive unless the problem is about ordering |
| `concept` | any tag | free grouping string, carried on journal events |
| `label` | short title | problem title for journals and history |
| `autofocus` | boolean | focus editor after boot; off by default |

Child text is the problem prompt (plain, visible even without the script):

```html
<sql-workbench namespace="lesson-3" dataset="books" mode="card"
               concept="left-join" label="Books nobody reviewed"
               test='[["The Pragmatic Programmer"],["Database Internals"]]'>
  Find every book that has no reviews.
</sql-workbench>
```

Omit `sql` for a recall problem — the learner writes from memory and the
same test grades the result. There is no problem list or progression UI
in the component; hosts drive navigation via `setProblem()`:

## Fixtures

A fixture is a JSON file that seeds the bench with tables and data. Create one at `fixtures/<id>.json`, load it with `dataset="<id>"`.

**Dataset references** — `dataset` takes a bare slug or a location:

- `dataset="<slug>"` — loads `fixtures/<id>.json` relative to the app root (Pages demo, self-contained deploys).
- `dataset="/path/to/<id>"` or `dataset="https://…"` — loads the JSON at that exact path or URL; for hosts that keep datasets in their own storage. The bench identifies the dataset by the location's last segment, and the fixture's `id` field must match it.

**Schema** — the built-in `ecommerce` fixture:

| Table | Columns |
| --- | --- |
| `customers` | `id`, `name`, `region`, `signup_date` |
| `products` | `id`, `name`, `list_price` |
| `orders` | `id`, `customer_id` → customers, `order_date`, `status` (shipped/pending/cancelled), `total_amount`, `shipped_at` |
| `order_items` | `id`, `order_id` → orders, `product_id` → products, `quantity`, `unit_price` |

**Sample rows** — 6 customers, 4 products, 10 orders, 12 line items. Customers span 6 regions (europe, north_america, africa, south_asia, middle_east). Orders mix shipped, pending, and cancelled statuses.

**Fixture JSON shape:**

```json
{
  "id": "ecommerce",
  "kind": "sqlite-dataset",
  "version": 1,
  "title": "E-commerce sample",
  "description": "A tiny web shop: customers place orders.",
  "reset": {
    "sql": "CREATE TABLE ... ; INSERT INTO ..."
  }
}
```

The `reset.sql` contains the full seed script — `CREATE TABLE` + `INSERT` statements. See [`public/fixtures/ecommerce.json`](public/fixtures/ecommerce.json) for the complete example.

The `id` must match the filename stem. The `reset.sql` runs on every load and Reset — keep it idempotent. Seed SQL stays plain and readable; no base64.

## API

```js
const bench = document.querySelector("sql-workbench");

await bench.run("SELECT * FROM orders LIMIT 5");  // → Outcome, journaled
await bench.reset();                               // re-seed the dataset
const md = await bench.exportMarkdown();           // session journal as Markdown
const events = await bench.events();               // journal entries, newest first
bench.setTheme("dark");

// Problem slot: agent-driven navigation + graded runs
bench.setProblem({ title: "Ratings per title", concept: "aggregate-null",
                   prompt: "Average stars per title.", test: { rows: [["Database Internals", 4.5]] } });
const { outcome, verdict } = await bench.runGraded("SELECT ...", { actor: "agent" });
bench.loadedProblem;                               // the Problem or null

bench.addEventListener("workbench-event", (e) => {
  // e.detail: { type: "query" | "step" | "dataset-reset" | "csv-import" | "csv-import-removed", ... }
});

// Agent-driven navigation: swap the problem slot. Not journaled.
bench.setProblem({
  title: "Ratings per title",
  concept: "aggregate-null",
  prompt: "Average stars per title. Include the book with no reviews.",
  sql: "",               // omit/empty = write from memory
  test: { rows: [["Database Internals", 4.5]] },
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
