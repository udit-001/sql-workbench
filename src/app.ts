/**
 * The bench application behind the mount seam (component + standalone
 * share one implementation). `mount(host, opts)` builds the entire bench
 * DOM inside `host` (a shadow root's wrapper, or a plain container),
 * wires every module, and returns a small control handle.
 *
 * What the caller must provide: a host element and optional dataset /
 * mode / theme / storage-namespace choices. Everything else — engine,
 * journal, schema, CSV, export — is internal.
 */
import styles from "./styles.css?inline";
import { Bench, mutatesData } from "./bench-kit/bench";
import { createCoalescedQueue } from "./bench-kit/coalesced-queue";
import { buildImportScript, parseCsv } from "./bench-kit/csv";
import { deleteImportedTable, listImportedTables, saveImportedTable, type ImportedTable } from "./bench-kit/csv-store";
import { eventsToMarkdown } from "./bench-kit/export-markdown";
import { formatCount } from "./bench-kit/format";
import { fetchDataset, FixtureError } from "./bench-kit/fixture";
import { highlightSql } from "./bench-kit/highlight";
import type { Outcome } from "./bench-kit/engine";
import { openJournal } from "./bench-kit/journal-idb";
import type { WorkbenchEvent } from "./bench-kit/journal";
import { layoutTables, loadRelations, loadSchema } from "./bench-kit/schema";
import { createThemeController } from "./bench-kit/theme-controller";
import type { Theme } from "./bench-kit/theme";
import { WasmEngine } from "./bench-kit/wasm/wasm-engine";
import { WorkerRpcError } from "./bench-kit/wasm/worker-rpc";
import { DEMO_DATASET } from "./demo-dataset";
import { DiagramPane } from "./ui/diagram";
import { DomUi } from "./ui/dom-ui";
import { HistoryTab } from "./ui/history-tab";
import { ImportModal, type ImportSelection } from "./ui/import-modal";
import { SchemaPanel } from "./ui/schema-panel";

/** The bench's DOM — moved verbatim from index.html; ids are the internal
    wiring contract between this template and mount(). */
export const BENCH_TEMPLATE = `
<header class="top">
  <span class="name">sql-workbench</span>
  <span class="chip" id="dataset-chip" hidden></span>
  <span class="spacer"></span>
  <button class="ghost" id="import-btn" style="font-size:.75rem" title="Load your own CSV file and query it like any table">↑ Import CSV</button>
  <button class="iconbtn" id="theme-toggle" aria-label="Toggle light or dark theme" title="Theme">
    <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="16" height="16"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
    <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="16" height="16"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
  </button>
</header>

<!-- Mobile-only view switcher (spec user story 17) -->
<nav class="seg" aria-label="Bench sections">
  <button type="button" data-seg="schema">Schema</button>
  <button type="button" data-seg="query" class="on">Query</button>
  <button type="button" data-seg="results">Results</button>
  <button type="button" data-seg="diagram">Diagram</button>
  <button type="button" data-seg="history">History</button>
</nav>

<div class="shell">
  <aside class="schema" part="schema" id="schema-panel" aria-label="Tables in this sample dataset"></aside>

  <section class="main">
    <div class="ed-tools">
      <button class="run" part="run-button" id="run-btn">▸ Run query</button>
      <button class="ghost" part="reset-button" id="reset-btn" title="Restore the original sample data">Reset data</button>
      <span class="spacer"></span>
      <span class="kbd-hint"><kbd id="modkey">Ctrl</kbd>+<kbd>Enter</kbd> to run</span>
    </div>

    <div class="editor-wrap" id="editor-wrap">
      <pre class="highlight-layer" id="highlight-layer" aria-hidden="true"><code class="highlight-code" id="highlight-code"></code></pre>
      <textarea
        part="editor" id="editor"
        class="editor"
        spellcheck="false"
        aria-label="SQL query"
        placeholder="Type SQL, then press Ctrl+Enter…"
      ></textarea>
    </div>

    <div class="tabs" role="tablist">
      <button class="tab on" id="tab-results" role="tab" aria-selected="true">Results</button>
      <button class="tab" id="tab-diagram" role="tab" aria-selected="false">Diagram</button>
      <button class="tab" id="tab-history" role="tab" aria-selected="false">History <span id="history-count"></span></button>
    </div>

    <section part="results" id="results" class="pane on pane-results" aria-live="polite" aria-label="Query results"></section>

    <section part="diagram" id="diagram-pane" class="pane diagram" aria-label="Database diagram"></section>

    <section part="history" id="history-pane" class="pane jr" aria-label="Run history">
      <div class="jr-tools">
        <button class="ghost" id="export-btn" title="Download your runs as Markdown — paste it into any chat">↓ Export Markdown</button>
      </div>
      <div id="history-list"></div>
      <div class="jr-note" id="history-empty">No runs yet — press Ctrl+Enter to run a query.</div>
    </section>

    <div class="empty-state" id="empty-state" hidden>
      <div class="empty-title">Get started</div>
      <div class="empty-hint">Write a CREATE TABLE statement and press Run, or</div>
      <button class="empty-cta" id="empty-load-demo">Load sample dataset</button>
    </div>

    <footer class="statusbar" part="statusbar" id="statusbar" aria-live="polite">Ready</footer>
  </section>
</div>

<div class="overlay" id="import-overlay">
  <div class="modal">
    <header>Import CSV</header>
    <div class="body">
      <div class="filemeta" id="import-filemeta">Reading file…</div>
      <div class="preview-wrap"><table class="preview-table" id="import-preview"></table></div>
      <div class="frow">
        <label for="import-name">Table name</label>
        <input type="text" id="import-name" spellcheck="false" />
        <span class="kbd-hint">from filename — edit if you like</span>
      </div>
      <div class="frow">
        <label for="import-delimiter">Delimiter</label>
        <select id="import-delimiter">
          <option value="," selected>comma ( , )</option>
          <option value=";">semicolon ( ; )</option>
          <option value="\\t">tab</option>
        </select>
        <label class="chk"><input type="checkbox" id="import-header" checked /> First row holds column names</label>
      </div>
      <div class="drop-hint">…or drop a .csv anywhere on the bench</div>
      <div class="boot-error" id="import-error" hidden></div>
    </div>
    <footer>
      <button class="ghost" id="import-cancel">Cancel</button>
      <button class="run" id="import-go">Import</button>
    </footer>
  </div>
</div>
`.trim();

export interface MountOptions {
  /** "card" hides all chrome for embedded drill use (LEARN-205). */
  mode?: string;
  /** Explicit theme override; omit to follow the host (then the OS). */
  theme?: Theme;
  /** Storage namespace: two benches on one page get separate journals
      and imported tables. Defaults to the standalone namespace. */
  namespace?: string;
  /** Dataset reference to load instead of the built-in demo dataset: a bare
   *  slug resolves to `fixtures/<id>.json` relative to the app root, while a
   *  root-relative path or absolute URL is fetched verbatim — the host owns
   *  storage and serving (pharos: its workspace datasets API). */
  dataset?: string;
  /** Boot-time editor prefill ("starter query"). Wins over the dataset-
      derived and demo defaults; set once at connect — post-connect control
      is run(). Prefilling is not an action: nothing is journaled, and an
      invalid query surfaces through the learner's own run. */
  sql?: string;
  /** Take keyboard focus after boot (mirrors the HTML autofocus
      attribute). Off by default: a bench embedded mid-page must not grab
      the host's keyboard — the host opts in when the bench is the task,
      e.g. a card drill in its own iframe. */
  autofocus?: boolean;
  /** Called for every journaled event (query runs, resets, imports). */
  onEvent?: (event: WorkbenchEvent) => void;
  /** Called when the bench's table count changes (empty ↔ populated). */
  onStateChange?: (state: { tableCount: number }) => void;
}

export interface WorkbenchHandle {
  /** Run SQL as if typed into the editor; journaled like any run. */
  run(sql: string): Promise<Outcome | undefined>;
  /** Restore the current dataset's seed data. */
  reset(): Promise<void>;
  /** The whole session journal as Markdown. */
  exportMarkdown(): Promise<string>;
  /** All journaled events, newest first — same shapes the
      `workbench-event` CustomEvent carries as `detail`. */
  events(): Promise<WorkbenchEvent[]>;
  /** Apply a theme now ('light' | 'dark'); overrides host-following. */
  setTheme(theme: Theme): void;
  /** Current number of tables in the database. */
  tableCount: number;
  /** Tear down listeners and the engine worker. */
  dispose(): void;
}

export function mount(host: HTMLElement, opts: MountOptions = {}): WorkbenchHandle {
  host.classList.add("bench");
  host.dataset.view = "query";
  host.innerHTML = BENCH_TEMPLATE;

  const root: ParentNode = host;
  const $ = <T extends HTMLElement>(id: string): T => {
    const el = root.querySelector(`#${id}`);
    if (!el) throw new Error(`missing #${id} — BENCH_TEMPLATE out of sync with mount()`);
    return el as T;
  };
  // Focus tracking must see inside the shadow root: document.activeElement
  // reports the host element, not the focused editor. Both Documents and
  // ShadowRoots expose activeElement, so ask the bench's own root node.
  const scope = host.getRootNode() as Document | ShadowRoot;
  const activeElement = (): Element | null => scope.activeElement;

  /* Theme: follows the host until explicitly set (LEARN-224-safe).
     Controller lives in bench-kit -- see theme-controller.ts. */
  const theme = createThemeController((t) => {
    host.dataset.theme = t;
  }, { initialExplicit: opts.theme ?? null });

  $("theme-toggle").addEventListener("click", () => {
    theme.set(host.dataset.theme === "dark" ? "light" : "dark");
  });

  /* ⌘ on Apple platforms, Ctrl elsewhere. */
  {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ?? navigator.platform;
    if (/Mac|iPhone|iPad/i.test(platform)) $("modkey").textContent = "⌘";
  }

  /* Card mode (LEARN-205): embedded drill variant — chrome hides via CSS. */
  if (opts.mode === "card") host.dataset.mode = "card";

  /* --- Empty state (tableCount tracking) -------------------------------- */
  let tableCount = 0;
  const emptyState = $("empty-state");

  function updateEmptyState(count: number): void {
    if (count === tableCount) return;
    tableCount = count;
    emptyState.hidden = count > 0;
    opts.onStateChange?.({ tableCount: count });
  }

  const engine = WasmEngine.spawn();

  /* Live schema names for did-you-mean suggestions on SQL errors. */
  let schemaContext: { tables: string[]; columns: string[] } = { tables: [], columns: [] };

  const ui = new DomUi($("run-btn"), $("results"), $("statusbar"), () => schemaContext);
  const bench = new Bench(engine, ui);
  const editor = $<HTMLTextAreaElement>("editor");
  const resetButton = $<HTMLButtonElement>("reset-btn");
  const runButton = $<HTMLButtonElement>("run-btn");

  /* --- Syntax highlighting (LEARN-210): transparent textarea over a
     colored twin. Programmatic .value swaps don't fire input, so every
     prefill path calls refreshHighlight() explicitly. */
  const highlightLayer = $("highlight-layer");
  const highlightCode = $("highlight-code");

  function refreshHighlight(): void {
    highlightCode.replaceChildren(
      ...highlightSql(editor.value).map((token) => {
        const span = document.createElement("span");
        span.className = `tok-${token.kind}`;
        span.textContent = token.text;
        return span;
      }),
      // The textarea reserves one line past a trailing newline; match it
      // so vertical scroll and caret position never drift apart.
      document.createTextNode("\n"),
    );
    highlightLayer.scrollTop = editor.scrollTop;
  }

  editor.addEventListener("input", refreshHighlight);
  editor.addEventListener("scroll", () => {
    highlightLayer.scrollTop = editor.scrollTop;
    highlightLayer.scrollLeft = editor.scrollLeft;
  });

  /* Track the editor caret so schema-panel clicks insert where the learner
     was looking — not wherever the textarea's stale focus state points.
     The tracked offsets carry the value length they were seen at: if the
     value has since changed programmatically (boot/reset), they are stale
     and we fall back to appending at the end. */
  let caret: { start: number; end: number; len: number } | null = null;
  function rememberCaret(): void {
    if (activeElement() === editor) {
      caret = {
        start: editor.selectionStart ?? 0,
        end: editor.selectionEnd ?? 0,
        len: editor.value.length,
      };
    }
  }
  for (const event of ["keyup", "mouseup", "touchend", "input", "focus"] as const) {
    editor.addEventListener(event, rememberCaret);
  }

  /**
   * Insert an identifier at the remembered caret (default: append), keeping
   * it from gluing onto neighbouring tokens: "SELECT⎮FROM" + region →
   * "SELECT region FROM". Focus returns to the editor with the caret just
   * after the inserted name so typing continues seamlessly.
   */
  function insertIdentifier(identifier: string): void {
    const value = editor.value;
    const tracked = caret && caret.len === value.length ? caret : null;
    const { start, end } = tracked ?? { start: value.length, end: value.length };
    const charBefore = value[start - 1] ?? "";
    const charAfter = value[end] ?? "";
    // Pad so the identifier never glues onto neighbouring tokens:
    // "SELECT|FROM" + region → "SELECT region FROM", but "o.|region" stays
    // "o.region" and trailing spaces/commas are left alone.
    const padBefore = /[\w"'\]);]/.test(charBefore) ? " " : "";
    const padAfter = /[\w"']/.test(charAfter) ? " " : "";

    const inserted = `${padBefore}${identifier}${padAfter}`;
    editor.setRangeText(inserted, start, end, "end");
    const newCaret = start + inserted.length;
    caret = { start: newCaret, end: newCaret, len: editor.value.length };
    // The click on the schema panel already says where the user is
    // looking — take the caret without scrolling the page to the editor.
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(newCaret, newCaret);
    refreshHighlight(); // setRangeText doesn't fire input
  }

  const namespace = opts.namespace;
  const schemaPanel = new SchemaPanel($("schema-panel"), insertIdentifier, (name) => {
    void removeImportedTable(name);
  });
  const diagramPane = new DiagramPane($("diagram-pane"), insertIdentifier);

  /* --- Journal + History (LEARN-203) ---------------------------------- */

  const journalPromise = openJournal(namespace);
  const history = new HistoryTab(
    $("history-list"),
    $("history-count"),
    $("history-empty"),
    $("export-btn"),
  );

  /* The one place "which dataset is loaded" lives: slug id for journal
     events, display title, and the statements Reset re-executes. */
  let currentDataset: { id: string; title: string; seedStatements: string[] } = {
    id: "empty",
    title: "Empty",
    seedStatements: [],
  };

  /** Load a dataset: seed the engine, refresh schema, update the chip. */
  async function loadDataset(id: string, title: string, statements: string[], opts?: { starterQuery?: string }): Promise<void> {
    currentDataset = { id, title, seedStatements: statements };
    await engine.load(statements);
    await replayImports();
    await refreshSchema(title);
    const chip = $("dataset-chip");
    chip.textContent = `${title} · sample data`;
    chip.hidden = false;
    if (opts?.starterQuery) {
      editor.value = opts.starterQuery;
      refreshHighlight();
    }
  }

  /** Journal an event, then bring the History tab back in sync. */
  async function recordEvent(event: WorkbenchEvent): Promise<void> {
    const journal = await journalPromise;
    await journal.append(event);
    await history.refresh(await journal.list());
    opts.onEvent?.(event);
  }

  async function recordQuery(sql: string, outcome: Outcome): Promise<void> {
    const base = { id: crypto.randomUUID(), ts: Date.now(), fixture: currentDataset.id };
    await recordEvent(
      outcome.kind === "ok"
        ? { ...base, type: "query", sql, ok: true, rows: outcome.rowCount, ms: outcome.ms }
        : { ...base, type: "query", sql, ok: false, error: outcome.message },
    );
  }

  /** Submit what's in the editor; blank is a no-op; journaled immediately.
      Infrastructural engine failures (crashed worker, stuck query) reject
      out of submit — one recovery attempt is made (fresh worker, re-seed,
      replay imports); if that fails too, the boot-error panel says so. */
  async function run(sql: string): Promise<Outcome | undefined> {
    let outcome: Outcome | undefined;
    try {
      outcome = await bench.submit(sql);
    } catch (err) {
      console.error("[sql-workbench] engine failure", err);
      // The rejection object is the death certificate: by the time this
      // catch runs, another caller may already have recovered the engine,
      // so the current dead-flag alone would misreport a healthy engine.
      if (engine.dead || err instanceof WorkerRpcError) {
        await recoverEngine();
        return undefined; // the failed query was lost; the editor still has it
      }
      ui.showBootError("The database engine failed — reload the page to restart it.");
      return undefined;
    }
    // Blank queries are a no-op; real runs land in the journal immediately.
    // Dirty tracking lives in Bench: submit() is its single writer.
    if (outcome) await recordQuery(sql.trim(), outcome);
    // A mutation attempt can change the schema (even a failed multi-
    // statement script may have applied its early statements) — keep the
    // panel, diagram, and did-you-mean context truthful without waiting
    // for the next import/reset.
    if (mutatesData(sql)) queueSchemaRefresh();
    return outcome;
  }

  let recovering = false;

  /** One-shot recovery after a worker crash or stuck query: respawn the
      worker, re-seed the current dataset, replay persisted imports. The
      incident itself is NOT journaled — the journal records learner
      actions, not infrastructure failures. Idempotent via `recovering`:
      several pending rejections collapse into one recovery. */
  async function recoverEngine(): Promise<void> {
    if (recovering) return;
    recovering = true;
    try {
      if (!engine.dead) return; // someone else already recovered it
      ui.setStatus("The database engine crashed — restarting…");
      engine.respawn();
      if (engine.isDisposed || engine.dead) throw new Error("engine could not restart");
      await engine.load(currentDataset.seedStatements);
      await replayImports();
      await refreshSchema(currentDataset.title);
      ui.setStatus("The database engine restarted — your data is restored; run your query again.");
    } catch (err) {
      console.error("[sql-workbench] engine recovery failed", err);
      ui.showBootError("The database engine failed — reload the page to restart it.");
    } finally {
      recovering = false;
    }
  }

  $("run-btn").addEventListener("click", () => void run(editor.value));
  host.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      // No hidden runs while the import modal blocks the view — the
      // learner's keystrokes belong to the modal until it closes.
      if (importModal.isOpen()) return;
      // The click path is guarded by the disabled button; the keyboard
      // path needs its own guard so spamming ⌘Enter can't stack
      // concurrent submits that race the journal and the results pane.
      if (runButton.disabled) return;
      event.preventDefault();
      void run(editor.value);
    }
  });

  /* Tabs (desktop) + segments (mobile) switch views together. */
  function selectView(view: string, active: Element): void {
    host.dataset.view = view;
    const isHistory = view === "history";
    const isResults = view === "results";
    const isDiagram = view === "diagram";
    $("tab-results").classList.toggle("on", !isHistory && !isDiagram);
    $("tab-diagram").classList.toggle("on", isDiagram);
    $("tab-history").classList.toggle("on", isHistory);
    for (const tab of ["tab-results", "tab-diagram", "tab-history"]) {
      $(tab).setAttribute("aria-selected", String($(tab).classList.contains("on")));
    }
    $("results").classList.toggle("on", isResults);
    $("diagram-pane").classList.toggle("on", isDiagram);
    $("history-pane").classList.toggle("on", isHistory);
    if (isDiagram && diagramState.dirty) void renderDiagramNow();
    for (const other of host.querySelectorAll("[data-seg]")) {
      other.classList.toggle("on", other === active);
    }
  }
  for (const button of host.querySelectorAll<HTMLButtonElement>("[data-seg]")) {
    button.addEventListener("click", () => selectView(button.dataset.seg ?? "query", button));
  }
  $("tab-results").addEventListener("click", (e) => {
    const seg = host.querySelector('[data-seg="results"]');
    selectView("results", seg ?? e.currentTarget as Element);
  });
  $("tab-diagram").addEventListener("click", (e) => {
    const seg = host.querySelector('[data-seg="diagram"]');
    selectView("diagram", seg ?? e.currentTarget as Element);
  });
  $("tab-history").addEventListener("click", (e) => {
    const seg = host.querySelector('[data-seg="history"]');
    selectView("history", seg ?? e.currentTarget as Element);
  });

  /* Export Markdown — chat-paste-ready practice log. Availability is
     HistoryTab's concern (it owns the journal display); the click just
     asks the journal for its events. */
  async function exportMarkdown(): Promise<string> {
    const journal = await journalPromise;
    return eventsToMarkdown(await journal.list());
  }

  $("export-btn").addEventListener("click", () => {
    void (async () => {
      const markdown = await exportMarkdown();
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sql-practice-${new Date().toISOString().slice(0, 10)}.md`;
      link.click();
      URL.revokeObjectURL(url);
    })();
  });

  /* --- Boot: decide the dataset (opts.dataset or built-in demo), seed, introspect */

  /**
   * Re-run every persisted CSV import against the current database. Called
   * after seeding on boot and on Reset — imported tables are the learner's
   * own data, so they survive both. Failures KEEP the stored bytes (a
   * transient error must not cost the learner their file); the table just
   * doesn't appear this session.
   */
  async function replayImports(): Promise<void> {
    const failed: string[] = [];
    for (const table of await listImportedTables(namespace)) {
      const outcome = await engine.run(
        buildImportScript(table.name, parseCsv(table.csvText, {
          delimiter: table.delimiter,
          hasHeader: table.hasHeader,
        })),
      );
      if (outcome.kind === "error") {
        failed.push(table.name);
        console.error(`[sql-workbench] could not restore imported table "${table.name}": ${outcome.message}`);
      }
    }
    if (failed.length > 0) {
      ui.setStatus(`Could not restore: ${failed.join(", ")} — see console`);
    }
  }

  async function refreshSchema(datasetTitle: string): Promise<void> {
    renderSchema(await loadSchema(engine), datasetTitle);
  }

  /** One schema refresh at a time; pushes landing mid-flight coalesce into
      a single rerun (see CoalescedQueue — out-of-order snapshot renders are
      the bug this prevents). Tasks own their errors: a failed refresh is
      logged, and the next mutation retries. */
  const schemaRefreshes = createCoalescedQueue();
  function queueSchemaRefresh(): void {
    schemaRefreshes.push(async () => {
      try {
        await refreshSchema(currentDataset.title);
      } catch (err) {
        console.error("[sql-workbench] schema refresh failed", err);
      }
    });
  }

  /* The diagram renders lazily: SVG text measurement returns 0 inside a
     display:none pane, so we draw on first activation and re-draw when a
     newer schema exists. */
  const diagramState: { dirty: boolean; tables: Awaited<ReturnType<typeof loadSchema>> } = {
    dirty: true,
    tables: [],
  };

  async function renderDiagramNow(): Promise<void> {
    try {
      const relations = await loadRelations(engine);
      diagramPane.render(layoutTables(diagramState.tables, relations), relations);
      diagramState.dirty = false;
    } catch (err) {
      console.error("[sql-workbench] diagram failed", err);
    }
  }

  /** Render with "yours" badges merged onto learner-imported tables. */
  async function renderSchema(tables: Awaited<ReturnType<typeof loadSchema>>, datasetTitle: string): Promise<void> {
    const mine = new Map((await listImportedTables(namespace)).map((t) => [t.name, t]));
    const merged = tables.map((table) => {
      const record = mine.get(table.name);
      return record
        ? { ...table, yours: true, yoursTitle: `${record.filename} · saved in this browser` }
        : table;
    });
    schemaPanel.render(merged, datasetTitle);
    diagramState.tables = merged;
    schemaContext = {
      tables: merged.map((t) => t.name),
      columns: merged.flatMap((t) => t.columns.map((c) => c.name)),
    };
    diagramState.dirty = true;
    updateEmptyState(tables.length);
    if (host.dataset.view === "diagram") await renderDiagramNow();
  }

  // Boot is async (fixture fetch, seeding, introspection) but mount() is
  // sync (custom elements connect synchronously). Failures fail loud:
  // console + visible panel.
  void (async () => {
  try {
    // Boot query precedence: explicit sql attr > dataset-derived > empty.
    let starterQuery: string | null = opts.sql ?? null;

    if (opts.dataset) {
      const fixture = await fetchDataset(opts.dataset); // throws plain-language FixtureError
      // The journal's dataset id is the stem from the loaded file — for a
      // host-owned URL reference the attribute value is a location, not an
      // id, and journaling a URL would make history unreadable.
      await loadDataset(fixture.id, fixture.title, [fixture.sql]);
      starterQuery = null; // filled from the loaded schema below
    } else {
      await engine.load([]);
      await replayImports();
      await renderSchema(await loadSchema(engine), currentDataset.title);
    }

    const tables = await loadSchema(engine);
    if (!starterQuery && tables[0]) {
      starterQuery = `SELECT *\nFROM ${tables[0].name}\nLIMIT 10;`;
    }
    editor.value = starterQuery ?? "";
    refreshHighlight();

    const journal = await journalPromise;
    await history.refresh(await journal.list());
    // Autofocus is opt-in (opts.autofocus / the autofocus attribute), and
    // even then only when the human hasn't beaten us to it: boot can take
    // seconds on a slow connection, and a focus that lands after the user
    // already Tab'd or clicked somewhere is theft, not convenience.
    if (opts.autofocus && document.activeElement === document.body) {
      // preventScroll: the host chose focus, not scroll.
      editor.focus({ preventScroll: true });
    }
  } catch (err) {
    // Malformed/missing fixtures fail loud: console + visible panel.
    console.error("[sql-workbench]", err);
    if (err instanceof FixtureError) {
      // The message already carries the fix — render verbatim.
      ui.showBootError(err.message);
    } else {
      ui.showBootError(
        `Setup failed: ${(err as Error)?.message ?? String(err)} — ask your teacher to check the setup.`,
      );
    }
  }
  })();

  /* Reset data — re-executes the current seed deterministically.
     The body lives in resetDataset (single reset path); the button is
     the UI adapter for it, the handle re-exports it. */
  const resetDataset = async (): Promise<void> => {
    // Nothing has touched the data since the last seed — say so instead of
    // re-executing the seeds and appending a meaningless history entry.
    if (!bench.dirtySinceSeed) {
      ui.setStatus("Data is already fresh — nothing to restore");
      return;
    }
    resetButton.disabled = true;
    try {
      await engine.load(currentDataset.seedStatements);
      await replayImports();
      await refreshSchema(currentDataset.title);
      bench.markSeeded();
      await recordEvent({
        id: crypto.randomUUID(),
        type: "dataset-reset",
        ts: Date.now(),
        fixture: currentDataset.id,
      });
      ui.setStatus("Sample data restored");
    } catch (err) {
      console.error("[sql-workbench] reset failed", err);
      if (engine.dead || err instanceof WorkerRpcError) {
        // Recovery re-seeds as part of restarting, which is the reset the
        // learner asked for — let it report its own outcome.
        await recoverEngine();
        return;
      }
      ui.setStatus("Reset failed — see console");
    } finally {
      resetButton.disabled = false;
    }
  };
  resetButton.addEventListener("click", () => void resetDataset());

  /* --- Import CSV (LEARN-204) ----------------------------------------- */

  // Client-side guard only — protects the tab from multi-hundred-MB files.
  // The Pharos-side dataset cap and its server enforcement are LEARN-206.
  const MAX_CSV_BYTES = 50 * 1024 * 1024;
  const MAX_CSV_MB = MAX_CSV_BYTES / (1024 * 1024);

  const importModal = new ImportModal({
    overlay: $("import-overlay"),
    fileMeta: $("import-filemeta"),
    preview: $("import-preview"),
    nameInput: $<HTMLInputElement>("import-name"),
    delimiterSelect: $<HTMLSelectElement>("import-delimiter"),
    headerCheckbox: $<HTMLInputElement>("import-header"),
    importButton: $<HTMLButtonElement>("import-go"),
    cancelButton: $<HTMLButtonElement>("import-cancel"),
    errorBox: $("import-error"),
  });

  async function executeImport(
    filename: string,
    selection: ImportSelection,
    keepOnSchema = false,
  ): Promise<void> {
    // Importing replaces a previous version of YOUR table, but never a
    // sample/fixture one — that would silently destroy seeded practice data.
    const existing = await loadSchema(engine);
    if (existing.some((t) => t.name === selection.tableName)) {
      const mine = (await listImportedTables(namespace)).some((t) => t.name === selection.tableName);
      if (!mine) {
        throw new Error(
          `"${selection.tableName}" is already used by the sample data — pick another table name.`,
        );
      }
    }

    let outcome;
    try {
      outcome = await engine.run(selection.script);
    } catch (err) {
      console.error("[sql-workbench] import hit an engine failure", err);
      if (engine.dead || err instanceof WorkerRpcError) await recoverEngine();
      throw new Error(
        "The database engine crashed during the import — it has been restarted; try the import again.",
      );
    }
    if (outcome.kind === "error") throw new Error(outcome.message); // shown in the modal

    const record: ImportedTable = {
      name: selection.tableName,
      filename,
      csvText: selection.csvText,
      delimiter: selection.delimiter,
      hasHeader: selection.hasHeader,
      rows: selection.rows,
      importedAt: Date.now(),
    };
    await saveImportedTable(record, namespace);
    await recordEvent({
      id: crypto.randomUUID(),
      type: "csv-import",
      ts: Date.now(),
      name: selection.tableName,
      rows: selection.rows,
    });
    await refreshSchema(currentDataset.title);

    // Preserve the learner's draft: only prefill a "try it" query when the
    // editor holds nothing of theirs. Silently overwriting a query they
    // were typing would destroy unjournalled work.
    if (!editor.value.trim()) {
      editor.value = `SELECT *\nFROM ${selection.tableName}\nLIMIT 10;`;
      caret = null;
      refreshHighlight();
    }
    ui.setStatus(
      `Imported ${formatCount(selection.rows)} rows into ${selection.tableName}` +
        (keepOnSchema ? ` — ${importQueue.length} more file${importQueue.length === 1 ? "" : "s"} queued` : ""),
    );
    // Single imports land on Results (see the query prefill above); queue
    // imports stay on Schema so the next confirm-modal opens in context.
    if (keepOnSchema) {
      selectView("schema", host.querySelector('[data-seg="schema"]') ?? host);
    } else {
      selectView("results", host.querySelector('[data-seg="results"]') ?? host);
    }
    importModal.close();
  }

  /** Import a queue of CSVs, one confirm-modal per file, back to back.
   *  While a queue is active, imports land on the Schema view instead of
   *  jumping to Results — the user's next move is "next file", and each
   *  table's arrival in the sidebar is visible confirmation. */
  let importQueue: File[] = [];
  function importFiles(files: File[]): void {
    importQueue = files;
    void importNext();
  }
  async function importNext(): Promise<void> {
    const file = importQueue.shift();
    if (!file) return;
    try {
      if (file.size > MAX_CSV_BYTES) {
        ui.setStatus(`Skipped ${file.name} — the bench caps imports at ${MAX_CSV_MB} MB`);
        void importNext();
        return;
      }
      importModal.onExecute(async (selection) => {
        await executeImport(file.name, selection, importQueue.length > 0);
        void importNext();
      });
      await importModal.openFor(file.name, await file.text());
    } catch (err) {
      console.error("[sql-workbench] could not read CSV file", err);
      ui.setStatus(`Could not read ${file.name} — see console`);
    }
  }

  async function openCsvFile(file: File): Promise<void> {
    try {
      if (file.size > MAX_CSV_BYTES) {
        ui.setStatus(`CSV too large — the bench caps imports at ${MAX_CSV_MB} MB`);
        return;
      }
      importModal.onExecute((selection) => executeImport(file.name, selection));
      await importModal.openFor(file.name, await file.text());
    } catch (err) {
      console.error("[sql-workbench] could not read CSV file", err);
      ui.setStatus(`Could not read ${file.name} — see console`);
    }
  }

  $("import-btn").addEventListener("click", () => {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".csv,text/csv,text/plain";
    picker.multiple = true;
    picker.addEventListener("change", () => {
      const files = [...(picker.files ?? [])];
      if (files.length > 0) importFiles(files);
    });
    picker.click();
  });

  /* Drop a .csv anywhere on the bench. */
  let dragDepth = 0;
  function dragEnter(event: DragEvent): void {
    event.preventDefault();
    dragDepth++;
    host.classList.add("dragging");
  }
  function dragLeave(): void {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      host.classList.remove("dragging");
    }
  }
  function dragOver(event: DragEvent): void {
    event.preventDefault();
  }
  function drop(event: DragEvent): void {
    event.preventDefault();
    dragDepth = 0;
    host.classList.remove("dragging");
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) importFiles(files);
  }
  host.addEventListener("dragenter", dragEnter);
  host.addEventListener("dragleave", dragLeave);
  host.addEventListener("dragover", dragOver);
  host.addEventListener("drop", drop);

  /* Empty state: Load sample dataset button seeds the demo and hides the banner. */
  $("empty-load-demo").addEventListener("click", () => {
    void (async () => {
      await loadDataset(DEMO_DATASET.title, DEMO_DATASET.title, DEMO_DATASET.statements, {
        starterQuery: DEMO_DATASET.sampleQuery,
      });
      ui.setStatus("Sample dataset loaded");
    })();
  });

  /* ✕ on a "yours" table removes it and its stored bytes. */
  async function removeImportedTable(name: string): Promise<void> {
    if (!confirm(`Remove table "${name}"? Its saved CSV will be deleted too.`)) return;
    const outcome = await engine.run(`DROP TABLE IF EXISTS "${name}";`);
    if (outcome.kind === "error") {
      console.error("[sql-workbench] drop failed", outcome.message);
      ui.setStatus(`Could not remove ${name} — see console`);
      return;
    }
    await deleteImportedTable(name, namespace);
    await refreshSchema(currentDataset.title);
    // The removal is a learner action (✕ + confirm) — it belongs in the
    // agent's feed, per the LEARN-226 contract.
    await recordEvent({
      id: crypto.randomUUID(),
      type: "csv-import-removed",
      ts: Date.now(),
      name,
    });
    ui.setStatus(`Removed ${name}`);
  }

  /* ── Handle ─────────────────────────────────────────────────────────── */

  return {
    async run(sql: string) {
      editor.value = sql;
      caret = null;
      refreshHighlight();
      // Same submit path as the editor: one journaling point, one
      // infra-failure surface.
      return run(sql);
    },
    reset: () => resetDataset(),
    exportMarkdown,
    async events() {
      const journal = await journalPromise;
      return journal.list();
    },
    setTheme(t: Theme) {
      theme.set(t);
    },
    get tableCount() {
      return tableCount;
    },
    dispose() {
      theme.dispose();
      importModal.dispose();
      host.classList.remove("bench", "dragging");
      delete host.dataset.theme;
      delete host.dataset.mode;
      delete host.dataset.view;
      host.innerHTML = "";
      engine.dispose();
    },
  };
}
