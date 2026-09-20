import type { WorkbenchEvent } from "../bench-kit/journal";
import { formatCount } from "../bench-kit/format";

/**
 * History tab (LEARN-203): every recorded run with ✓/✗ styling, newest
 * first. Runs stay local — the note reminds learners their Pharos agent
 * reads this to shape the next lesson. Also owns the export button's
 * availability: an empty journal has nothing to export, so the button
 * disables instead of downloading a useless file.
 */
export class HistoryTab {
  constructor(
    private readonly list: HTMLElement,
    private readonly count: HTMLElement,
    private readonly emptyNote: HTMLElement,
    private readonly exportButton: HTMLButtonElement,
  ) {
    // Boot fills this from the persisted journal; until then assume empty.
    this.setExportAvailable(false);
  }

  async refresh(events: WorkbenchEvent[]): Promise<void> {
    this.setExportAvailable(events.length > 0);
    this.count.textContent = events.length > 0 ? `(${events.length})` : "";
    if (events.length === 0) {
      this.emptyNote.hidden = false;
      this.list.replaceChildren();
      return;
    }
    this.emptyNote.hidden = true;

    const rows = document.createDocumentFragment();
    for (const event of events) {
      rows.append(this.row(event));
    }
    this.list.replaceChildren(rows);
  }

  private setExportAvailable(available: boolean): void {
    this.exportButton.disabled = !available;
    this.exportButton.title = available
      ? "Download your runs as Markdown — paste it into any chat"
      : "No runs to export yet";
  }

  private row(event: WorkbenchEvent): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "jr-row";

    const dot = document.createElement("span");
    dot.className =
      event.type === "query" ? (event.ok ? "dot ok" : "dot err") : "dot reset";
    dot.title =
      event.type === "query"
        ? event.ok
          ? "successful run"
          : "failed run"
        : event.type === "csv-import-removed"
          ? "imported table removed"
          : "dataset reset";
    row.append(dot);

    const main = document.createElement("span");
    main.className = "jr-sql";
    if (event.type === "query") {
      main.textContent = event.ok ? event.sql : `${event.sql} → ${event.error}`;
      if (!event.ok) main.classList.add("jr-failed");
      main.title = `${event.fixture} — ${event.sql}`;
    } else if (event.type === "csv-import") {
      main.textContent = `Imported CSV ${event.name} (${formatCount(event.rows)} rows)`;
    } else if (event.type === "csv-import-removed") {
      main.textContent = `Removed imported table ${event.name}`;
    } else {
      main.textContent = `Reset sample data ${event.fixture}`;
    }
    row.append(main);

    const meta = document.createElement("span");
    meta.className = "jr-meta";
    meta.textContent =
      event.type === "query" && event.ok
        ? `${when(event.ts)} · ${formatCount(event.rows)} row${event.rows === 1 ? "" : "s"} · ${event.ms} ms`
        : when(event.ts);
    row.append(meta);

    return row;
  }
}

function when(ts: number): string {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  // Same convention as formatCount: en-US, machine-independent (SQLWB-7).
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
