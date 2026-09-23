import type { Outcome, QueryOutcome } from "../bench-kit/engine";
import type { BenchUi } from "../bench-kit/bench";
import { formatCount } from "../bench-kit/format";
import { explainSqlError, type ErrorContext } from "../bench-kit/error-help";

/**
 * BenchUi implementation rendering outcomes into the results pane and run
 * stats into the bottom statusbar. Values reach the DOM via textContent
 * only — SQL output is never parsed as HTML. NULL is rendered visibly
 * distinct from empty string (spec user story 7).
 */
export class DomUi implements BenchUi {
  private readonly runButton: HTMLButtonElement;
  private readonly results: HTMLElement;
  private readonly statusbar: HTMLElement;

  constructor(
    runButton: HTMLButtonElement,
    results: HTMLElement,
    statusbar: HTMLElement,
    /** Live schema snapshot for did-you-mean suggestions on SQL errors. */
    private readonly errorContext?: () => ErrorContext,
  ) {
    this.runButton = runButton;
    this.results = results;
    this.statusbar = statusbar;
  }

  setRunning(running: boolean): void {
    this.runButton.disabled = running;
    this.runButton.textContent = running ? "Running…" : "▸ Run query";
    if (running) {
      this.results.setAttribute("aria-busy", "true");
      this.setStatus("Running…");
    } else {
      this.results.removeAttribute("aria-busy");
    }
  }

  showOutcome(outcome: Outcome): void {
    this.results.replaceChildren(
      outcome.kind === "ok" ? renderOk(outcome) : this.renderError(outcome.message),
    );
    this.setStatus(
      outcome.kind === "ok"
        ? describeOk(outcome)
        : "Query failed — see the message above",
    );
  }

  /** Infrastructural messages that aren't tied to a query run. */
  setStatus(text: string): void {
    this.statusbar.textContent = text;
  }

  /** Infrastructural failure (worker/WASM/fixture) — not a learner SQL error.
   *  The message carries its own fix; no generic tail here. */
  showBootError(message: string): void {
    const panel = document.createElement("div");
    panel.className = "boot-error";
    panel.textContent = message;
    this.results.replaceChildren(panel);
    this.runButton.disabled = true;
    this.setStatus("Setup failed");
  }
  /**
   * Friendly diagnosis first (when the error matches a known pattern);
   * full mode keeps the verbatim message one toggle away — card mode
   * shows the simplified view only (LEARN-211).
   */
  private renderError(message: string): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = "error-panel";

    const verbatimCode = document.createElement("code");
    verbatimCode.textContent = message;

    const hint = explainSqlError(
      message,
      this.errorContext?.() ?? { tables: [], columns: [] },
    );
    if (!hint) {
      const label = document.createElement("span");
      label.className = "error-label";
      label.textContent = "SQLite error";
      panel.append(label, verbatimCode);
      return panel;
    }

    const hintBox = document.createElement("div");
    hintBox.className = "error-hint";
    const title = document.createElement("div");
    title.className = "error-hint-title";
    title.textContent = hint.title;
    hintBox.append(title);
    if (hint.suggestion) {
      const suggestion = document.createElement("div");
      suggestion.className = "error-suggestion";
      suggestion.textContent = hint.suggestion;
      hintBox.append(suggestion);
    }

    const originalWrap = document.createElement("div");
    originalWrap.className = "error-original";
    originalWrap.hidden = true;
    originalWrap.append(verbatimCode);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "error-toggle";
    toggle.textContent = "Show original message";
    toggle.addEventListener("click", () => {
      const showOriginal = originalWrap.hidden;
      originalWrap.hidden = !showOriginal;
      hintBox.hidden = showOriginal;
      toggle.textContent = showOriginal ? "Explain this error" : "Show original message";
    });

    panel.append(hintBox, originalWrap, toggle);
    return panel;
  }
}

function describeOk(outcome: QueryOutcome): string {
  const parts = [
    `${formatCount(outcome.rowCount)} row${outcome.rowCount === 1 ? "" : "s"}`,
    `${outcome.ms} ms`,
  ];
  parts.push(
    outcome.truncated
      ? `showing first ${formatCount(outcome.rows.length)}`
      : "showing all",
  );
  if (!outcome.truncated && outcome.rows.length === 0 && outcome.columns.length > 0) {
    parts.splice(2, 0, "no matching rows");
  } else if (!outcome.truncated && outcome.rows.length === 0 && outcome.columns.length === 0) {
    parts.push("statement executed");
  }
  return parts.join(" · ");
}

function renderOk(outcome: QueryOutcome): DocumentFragment {
  const frag = document.createDocumentFragment();
  if (outcome.columns.length === 0) {
    const note = document.createElement("div");
    note.className = "schema-empty";
    note.style.padding = "14px 16px";
    note.textContent = "Statement executed — no rows to show.";
    frag.append(note);
    return frag;
  }

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
        // Long values are ellipsised by CSS — keep the full text reachable.
        if (String(value).length > 40) td.title = String(value);
      }
      tr.append(td);
    }
    body.append(tr);
  }

  table.append(head, body);
  frag.append(table);
  return frag;
}
