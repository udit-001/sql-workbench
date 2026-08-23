import "./styles.css";
import { Bench } from "./bench-kit/bench";
import { WasmEngine } from "./bench-kit/wasm/wasm-engine";
import { DEMO_DATASET } from "./demo-dataset";
import { DomUi } from "./ui/dom-ui";

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
const ui = new DomUi($("run-btn"), $("results"));
const bench = new Bench(engine, ui);
const editor = $<HTMLTextAreaElement>("editor");

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

/* Boot: seed the sample data before the first query can run. */
try {
  await engine.load(DEMO_DATASET.statements);
  editor.value = DEMO_DATASET.sampleQuery;
  const chip = $("dataset-chip");
  chip.textContent = `${DEMO_DATASET.title} · sample data`;
  chip.hidden = false;
  editor.focus();
} catch (err) {
  ui.showBootError((err as Error)?.message ?? String(err));
}
