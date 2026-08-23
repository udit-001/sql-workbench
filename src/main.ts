import "./styles.css";
import { Bench } from "./bench-kit/bench";
import { eventsToMarkdown } from "./bench-kit/export-markdown";
import { fetchFixture } from "./bench-kit/fixture";
import type { Outcome } from "./bench-kit/engine";
import { openJournal } from "./bench-kit/journal-idb";
import { loadSchema } from "./bench-kit/schema";
import { WasmEngine } from "./bench-kit/wasm/wasm-engine";
import { DEMO_DATASET } from "./demo-dataset";
import { DomUi } from "./ui/dom-ui";
import { HistoryTab } from "./ui/history-tab";
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

const engine = WasmEngine.spawn();
const ui = new DomUi($("run-btn"), $("results"), $("statusbar"));
const bench = new Bench(engine, ui);
const editor = $<HTMLTextAreaElement>("editor");
const resetButton = $<HTMLButtonElement>("reset-btn");
const schemaPanel = new SchemaPanel($("schema-panel"), (column) => {
  const start = editor.selectionStart ?? editor.value.length;
  const end = editor.selectionEnd ?? start;
  editor.setRangeText(column, start, end, "end");
  editor.focus();
});

/* --- Journal + History (LEARN-203) ---------------------------------- */

const journal = await openJournal();
const history = new HistoryTab($("history-list"), $("history-count"), $("history-empty"));

let currentFixtureId = DEMO_DATASET.title; // journal events carry the dataset id

async function recordQuery(sql: string, outcome: Outcome): Promise<void> {
  const base = { id: crypto.randomUUID(), ts: Date.now(), fixture: currentFixtureId };
  await journal.append(
    outcome.kind === "ok"
      ? { ...base, type: "query", sql, ok: true, rows: outcome.rowCount, ms: outcome.ms }
      : { ...base, type: "query", sql, ok: false, error: outcome.message },
  );
  await history.refresh(await journal.list());
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

let seedStatements: string[] = DEMO_DATASET.statements;

async function refreshSchema(datasetTitle: string): Promise<void> {
  schemaPanel.render(await loadSchema(engine), datasetTitle);
}

try {
  const requestedId = new URLSearchParams(location.search).get("fixture");
  let datasetTitle = DEMO_DATASET.title;
  let starterQuery = DEMO_DATASET.sampleQuery;

  if (requestedId) {
    const fixture = await fetchFixture(requestedId); // throws plain-language FixtureError
    seedStatements = [fixture.sql];
    currentFixtureId = requestedId;
    datasetTitle = fixture.title;
    starterQuery = ""; // filled from the loaded schema below
  }

  await engine.load(seedStatements);
  const tables = await loadSchema(engine);
  schemaPanel.render(tables, datasetTitle);

  if (!starterQuery && tables[0]) {
    starterQuery = `SELECT *\nFROM ${tables[0].name}\nLIMIT 10;`;
  }
  editor.value = starterQuery;

  const chip = $("dataset-chip");
  chip.textContent = `${datasetTitle} · sample data`;
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
      await engine.load(seedStatements);
      await refreshSchema(currentDatasetTitle());
      await journal.append({
        id: crypto.randomUUID(),
        type: "dataset-reset",
        ts: Date.now(),
        fixture: currentFixtureId,
      });
      await history.refresh(await journal.list());
      ui.setStatus("Sample data restored");
    } catch (err) {
      console.error("[sql-workbench] reset failed", err);
      ui.setStatus("Reset failed — see console");
    } finally {
      resetButton.disabled = false;
    }
  })();
});

function currentDatasetTitle(): string {
  return $("dataset-chip").textContent?.replace(/ · sample data$/, "") ?? "sample data";
}
