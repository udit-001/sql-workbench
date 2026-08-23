import "./styles.css";
import { Bench } from "./bench-kit/bench";
import { buildImportScript, parseCsv } from "./bench-kit/csv";
import { deleteImportedTable, listImportedTables, saveImportedTable, type ImportedTable } from "./bench-kit/csv-store";
import { eventsToMarkdown } from "./bench-kit/export-markdown";
import { fetchFixture } from "./bench-kit/fixture";
import type { Outcome } from "./bench-kit/engine";
import { openJournal } from "./bench-kit/journal-idb";
import type { WorkbenchEvent } from "./bench-kit/journal";
import { loadSchema } from "./bench-kit/schema";
import { themeFromMessage } from "./bench-kit/theme";
import { WasmEngine } from "./bench-kit/wasm/wasm-engine";
import { DEMO_DATASET } from "./demo-dataset";
import { DomUi } from "./ui/dom-ui";
import { HistoryTab } from "./ui/history-tab";
import { ImportModal, type ImportSelection } from "./ui/import-modal";
import { SchemaPanel } from "./ui/schema-panel";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id} — index.html out of sync with main.ts`);
  return el as T;
};

/* Theme toggle — flips the shared pharos_theme key (Pharos + FOUC guard). */
$("theme-toggle").addEventListener("click", () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("pharos_theme", root.dataset.theme);
});

/* ⌘ on Apple platforms, Ctrl elsewhere. */
{
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ?? navigator.platform;
  if (/Mac|iPhone|iPad/i.test(platform)) $("modkey").textContent = "⌘";
}

/* Card mode (LEARN-205): embedded drill variant — chrome hides via CSS,
   theme arrives live from the parent lesson page. Full mode is unchanged. */
const isCardMode = new URLSearchParams(location.search).get("mode") === "card";
if (isCardMode) document.body.dataset.mode = "card";

/* Theme relay — the ONE message the embed contract allows. Works in every
   mode so a bench framed inside Pharos follows the dashboard too. */
window.addEventListener("message", (event) => {
  const theme = themeFromMessage(event.data);
  if (!theme) return;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("pharos_theme", theme);
});

const engine = WasmEngine.spawn();
const ui = new DomUi($("run-btn"), $("results"), $("statusbar"));
const bench = new Bench(engine, ui);
const editor = $<HTMLTextAreaElement>("editor");
const resetButton = $<HTMLButtonElement>("reset-btn");

/* Track the editor caret so schema-panel clicks insert where the learner
   was looking — not wherever the textarea's stale focus state points.
   The tracked offsets carry the value length they were seen at: if the
   value has since changed programmatically (boot/reset), they are stale
   and we fall back to appending at the end. */
let caret: { start: number; end: number; len: number } | null = null;
function rememberCaret(): void {
  if (document.activeElement === editor) {
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
  editor.focus();
  editor.setSelectionRange(newCaret, newCaret);
}

const schemaPanel = new SchemaPanel($("schema-panel"), insertIdentifier, (name) => {
  void removeImportedTable(name);
});

/* --- Journal + History (LEARN-203) ---------------------------------- */

const journal = await openJournal();
const history = new HistoryTab($("history-list"), $("history-count"), $("history-empty"));

/* The one place "which dataset is loaded" lives: slug id for journal
   events, display title, and the statements Reset re-executes. */
let currentDataset: { id: string; title: string; seedStatements: string[] } = {
  id: DEMO_DATASET.title,
  title: DEMO_DATASET.title,
  seedStatements: DEMO_DATASET.statements,
};

/** Journal an event, then bring the History tab back in sync. */
async function recordEvent(event: WorkbenchEvent): Promise<void> {
  await journal.append(event);
  await history.refresh(await journal.list());
}

async function recordQuery(sql: string, outcome: Outcome): Promise<void> {
  const base = { id: crypto.randomUUID(), ts: Date.now(), fixture: currentDataset.id };
  await recordEvent(
    outcome.kind === "ok"
      ? { ...base, type: "query", sql, ok: true, rows: outcome.rowCount, ms: outcome.ms }
      : { ...base, type: "query", sql, ok: false, error: outcome.message },
  );
}

async function runCurrentQuery(): Promise<void> {
  const sql = editor.value.trim();
  const outcome = await bench.submit(editor.value);
  // Blank queries are a no-op; real runs land in the journal immediately.
  if (outcome) await recordQuery(sql, outcome);
}

$("run-btn").addEventListener("click", () => void runCurrentQuery());
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void runCurrentQuery();
  }
});

/* Tabs (desktop) + segments (mobile) switch views together. */
function selectView(view: string, active: Element): void {
  document.body.dataset.view = view;
  const isHistory = view === "history";
  const isResults = view === "results";
  $("tab-results").classList.toggle("on", !isHistory);
  $("tab-history").classList.toggle("on", isHistory);
  $("tab-results").setAttribute("aria-selected", String(!isHistory));
  $("tab-history").setAttribute("aria-selected", String(isHistory));
  $("results").classList.toggle("on", isResults);
  $("history-pane").classList.toggle("on", isHistory);
  for (const other of document.querySelectorAll("[data-seg]")) {
    other.classList.toggle("on", other === active);
  }
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-seg]")) {
  button.addEventListener("click", () => selectView(button.dataset.seg ?? "query", button));
}
$("tab-results").addEventListener("click", (e) => {
  const seg = document.querySelector('[data-seg="results"]');
  selectView("results", seg ?? e.currentTarget as Element);
});
$("tab-history").addEventListener("click", (e) => {
  const seg = document.querySelector('[data-seg="history"]');
  selectView("history", seg ?? e.currentTarget as Element);
});

/* Export Markdown — chat-paste-ready practice log. */
$("export-btn").addEventListener("click", () => {
  void (async () => {
    const markdown = eventsToMarkdown(await journal.list());
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sql-practice-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  })();
});

/* --- Boot: decide the dataset (?fixture= or built-in demo), seed, introspect */

/**
 * Re-run every persisted CSV import against the current database. Called
 * after seeding on boot and on Reset — imported tables are the learner's
 * own data, so they survive both. Failures KEEP the stored bytes (a
 * transient error must not cost the learner their file); the table just
 * doesn't appear this session.
 */
async function replayImports(): Promise<void> {
  const failed: string[] = [];
  for (const table of await listImportedTables()) {
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

/** Render with "yours" badges merged onto learner-imported tables. */
async function renderSchema(tables: Awaited<ReturnType<typeof loadSchema>>, datasetTitle: string): Promise<void> {
  const mine = new Map((await listImportedTables()).map((t) => [t.name, t]));
  schemaPanel.render(
    tables.map((table) => {
      const record = mine.get(table.name);
      return record
        ? { ...table, yours: true, yoursTitle: `${record.filename} · saved in this browser` }
        : table;
    }),
    datasetTitle,
  );
}

try {
  const requestedId = new URLSearchParams(location.search).get("fixture");
  let starterQuery = DEMO_DATASET.sampleQuery;

  if (requestedId) {
    const fixture = await fetchFixture(requestedId); // throws plain-language FixtureError
    currentDataset = { id: requestedId, title: fixture.title, seedStatements: [fixture.sql] };
    starterQuery = ""; // filled from the loaded schema below
  }

  await engine.load(currentDataset.seedStatements);
  await replayImports();
  const tables = await loadSchema(engine);
  await renderSchema(tables, currentDataset.title);

  if (!starterQuery && tables[0]) {
    starterQuery = `SELECT *\nFROM ${tables[0].name}\nLIMIT 10;`;
  }
  editor.value = starterQuery;

  const chip = $("dataset-chip");
  chip.textContent = `${currentDataset.title} · sample data`;
  chip.hidden = false;
  await history.refresh(await journal.list());
  editor.focus();
} catch (err) {
  // Malformed/missing fixtures fail loud: console + visible panel.
  console.error("[sql-workbench]", err);
  ui.showBootError((err as Error)?.message ?? String(err));
}

/* Reset data — re-executes the current seed deterministically. */
resetButton.addEventListener("click", () => {
  void (async () => {
    resetButton.disabled = true;
    try {
      await engine.load(currentDataset.seedStatements);
      await replayImports();
      await refreshSchema(currentDataset.title);
      await recordEvent({
        id: crypto.randomUUID(),
        type: "dataset-reset",
        ts: Date.now(),
        fixture: currentDataset.id,
      });
      ui.setStatus("Sample data restored");
    } catch (err) {
      console.error("[sql-workbench] reset failed", err);
      ui.setStatus("Reset failed — see console");
    } finally {
      resetButton.disabled = false;
    }
  })();
});

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

async function executeImport(filename: string, selection: ImportSelection): Promise<void> {
  // Importing replaces a previous version of YOUR table, but never a
  // sample/fixture one — that would silently destroy seeded practice data.
  const existing = await loadSchema(engine);
  if (existing.some((t) => t.name === selection.tableName)) {
    const mine = (await listImportedTables()).some((t) => t.name === selection.tableName);
    if (!mine) {
      throw new Error(
        `"${selection.tableName}" is already used by the sample data — pick another table name.`,
      );
    }
  }

  const outcome = await engine.run(selection.script);
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
  await saveImportedTable(record);
  await recordEvent({
    id: crypto.randomUUID(),
    type: "csv-import",
    ts: Date.now(),
    name: selection.tableName,
    rows: selection.rows,
  });
  await refreshSchema(currentDataset.title);

  editor.value = `SELECT *\nFROM ${selection.tableName}\nLIMIT 10;`;
  caret = null;
  ui.setStatus(
    `Imported ${selection.rows.toLocaleString("en-US")} rows into ${selection.tableName}`,
  );
  selectView("results", document.querySelector('[data-seg="results"]') ?? document.body);
  importModal.close();
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
  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    if (file) void openCsvFile(file);
  });
  picker.click();
});

/* Drop a .csv anywhere on the bench. */
let dragDepth = 0;
window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth++;
  document.body.classList.add("dragging");
});
window.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove("dragging");
  }
});
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  document.body.classList.remove("dragging");
  const file = event.dataTransfer?.files?.[0];
  if (file) void openCsvFile(file);
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
  await deleteImportedTable(name);
  await refreshSchema(currentDataset.title);
  ui.setStatus(`Removed ${name}`);
}
