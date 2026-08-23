import "./styles.css";
import { Bench } from "./bench-kit/bench";
import { fetchFixture } from "./bench-kit/fixture";
import { loadSchema } from "./bench-kit/schema";
import { WasmEngine } from "./bench-kit/wasm/wasm-engine";
import { DEMO_DATASET } from "./demo-dataset";
import { DomUi } from "./ui/dom-ui";
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

async function runCurrentQuery(): Promise<void> {
  await bench.submit(editor.value);
}

$("run-btn").addEventListener("click", () => void runCurrentQuery());
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void runCurrentQuery();
  }
});

/* Mobile view switcher (spec user story 17). */
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-seg]")) {
  button.addEventListener("click", () => {
    document.body.dataset.view = button.dataset.seg ?? "query";
    for (const other of document.querySelectorAll("[data-seg]")) {
      other.classList.toggle("on", other === button);
    }
  });
}

/* Boot: decide the dataset (?fixture= or built-in demo), seed, introspect. */
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
