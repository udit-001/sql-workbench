import type { Outcome, QueryOutcome } from "../bench-kit/engine";
import type { BenchUi } from "../bench-kit/bench";

/**
 * BenchUi implementation rendering outcomes into the results pane.
 * Values reach the DOM via textContent only — SQL output is never parsed
 * as HTML. NULL is rendered visibly distinct from empty string (spec user
 * story 7).
 */
export class DomUi implements BenchUi {
  private readonly runButton: HTMLButtonElement;
  private readonly results: HTMLElement;

  constructor(
    runButton: HTMLButtonElement,
    results: HTMLElement,
  ) {
    this.runButton = runButton;
    this.results = results;
  }

  setRunning(running: boolean): void {
    this.runButton.disabled = running;
    this.runButton.textContent = running ? "Running…" : "▸ Run query";
    if (running) this.results.setAttribute("aria-busy", "true");
    else this.results.removeAttribute("aria-busy");
  }

  showOutcome(outcome: Outcome): void {
    this.results.replaceChildren(
      outcome.kind === "ok" ? renderOk(outcome) : renderError(outcome.message),
    );
  }

  /** Infrastructural failure (worker/WASM) — not a learner SQL error. */
  showBootError(message: string): void {
    const panel = document.createElement("div");
    panel.className = "boot-error";
    panel.textContent =
      `The SQL engine failed to start: ${message} — check the console, then reload.`;
    this.results.replaceChildren(panel);
    this.runButton.disabled = true;
  }
}

function renderOk(outcome: QueryOutcome): DocumentFragment {
  const frag = document.createDocumentFragment();

  const meta = document.createElement("div");
  meta.className = "result-meta";
  meta.append(
    `${formatCount(outcome.rowCount)} row${outcome.rowCount === 1 ? "" : "s"}`,
    ` · ${outcome.ms} ms`,
  );
  if (outcome.truncated) {
    meta.append(` · showing first ${formatCount(outcome.rows.length)}`);
  }

  if (!outcome.truncated && outcome.rows.length === 0) {
    meta.append(outcome.columns.length === 0 ? " · statement executed" : " · no matching rows");
  }

  frag.append(meta);

  if (outcome.columns.length === 0) return frag; // non-SELECT statement

  const table = document.createElement("table");
  table.className = "grid";

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const name of outcome.columns) {
    const th = document.createElement("th");
    th.textContent = name;
    th.scope = "col";
    headRow.append(th);
  }
  head.append(headRow);

  const body = document.createElement("tbody");
  for (const row of outcome.rows) {
    const tr = document.createElement("tr");
    for (const value of row) {
      const td = document.createElement("td");
      if (value === null || value === undefined) {
        const nullMark = document.createElement("span");
        nullMark.className = "null";
        nullMark.textContent = "NULL";
        td.append(nullMark);
      } else if (value instanceof Uint8Array) {
        td.textContent = `<blob ${value.length} bytes>`;
      } else {
        td.textContent = String(value);
      }
      tr.append(td);
    }
    body.append(tr);
  }

  table.append(head, body);
  frag.append(table);
  return frag;
}

function renderError(message: string): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = "error-panel";
  const label = document.createElement("span");
  label.className = "error-label";
  label.textContent = "SQLite error";
  const text = document.createElement("code");
  text.textContent = message;
  panel.append(label, text);
  return panel;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
