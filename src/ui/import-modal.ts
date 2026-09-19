import { buildImportScript, parseCsv, sanitizeTableName, type ParsedCsv } from "../bench-kit/csv";

export interface ImportSelection {
  tableName: string;
  script: string;
  csvText: string;
  delimiter: string;
  hasHeader: boolean;
  rows: number;
}

/**
 * The Import CSV modal (LEARN-204): file meta, preview rows,
 * auto-derived sanitized table name, delimiter/header overrides.
 * Pure presentation + state; the caller executes the resulting script.
 */
export class ImportModal {
  private readonly overlay: HTMLElement;
  private readonly fileMeta: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly delimiterSelect: HTMLSelectElement;
  private readonly headerCheckbox: HTMLInputElement;
  private readonly importButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly errorBox: HTMLElement;

  private csvText = "";
  private filename = "";
  private onImport: ((selection: ImportSelection) => Promise<void>) | undefined;

  constructor(elements: {
    overlay: HTMLElement;
    fileMeta: HTMLElement;
    preview: HTMLElement;
    nameInput: HTMLInputElement;
    delimiterSelect: HTMLSelectElement;
    headerCheckbox: HTMLInputElement;
    importButton: HTMLButtonElement;
    cancelButton: HTMLButtonElement;
    errorBox: HTMLElement;
  }) {
    this.overlay = elements.overlay;
    this.fileMeta = elements.fileMeta;
    this.preview = elements.preview;
    this.nameInput = elements.nameInput;
    this.delimiterSelect = elements.delimiterSelect;
    this.headerCheckbox = elements.headerCheckbox;
    this.importButton = elements.importButton;
    this.cancelButton = elements.cancelButton;
    this.errorBox = elements.errorBox;
    this.cancelButton.addEventListener("click", () => this.close());
    this.overlay.addEventListener("click", (event) => {
      if (event.target === this.overlay) this.close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen()) this.close();
    });
    for (const control of [this.delimiterSelect, this.headerCheckbox]) {
      control.addEventListener("change", () => this.refresh());
    }
    this.importButton.addEventListener("click", () => {
      void this.submit();
    });
  }

  isOpen(): boolean {
    return this.overlay.classList.contains("on");
  }

  /** Open the modal for a freshly-read CSV file. */
  async openFor(filename: string, csvText: string): Promise<void> {
    this.csvText = csvText;
    this.filename = filename;
    const stem = filename.replace(/\.[^.]+$/, "");
    this.nameInput.value = sanitizeTableName(stem);
    this.delimiterSelect.value = detectDelimiter(csvText);
    this.headerCheckbox.checked = true;
    this.errorBox.hidden = true;
    this.refresh();
    this.overlay.classList.remove("closing"); // cancels a pending hide
    this.overlay.classList.add("on");
    this.nameInput.focus();
  }

  close(): void {
    if (!this.isOpen()) return;
    // Bridge the exit with the same motion the entry used (200ms), then
    // hide. The guard lets a fast reopen cancel the pending hide.
    this.overlay.classList.add("closing");
    window.setTimeout(() => {
      if (this.overlay.classList.contains("closing")) {
        this.overlay.classList.remove("on", "closing");
      }
    }, 200);
    this.onImport = undefined;
    this.csvText = "";
    this.filename = "";
  }

  /** Registers the execute callback; set fresh on every open. */
  onExecute(callback: (selection: ImportSelection) => Promise<void>): void {
    this.onImport = callback;
  }

  /** Re-parse with current settings and repaint meta/preview/footer. */
  refresh(): void {
    if (!this.csvText) return;
    const sizeKb = (new Blob([this.csvText]).size / 1024).toFixed(1);
    try {
      const parsed = parseCsv(this.csvText, {
        delimiter: this.delimiter(),
        hasHeader: this.headerCheckbox.checked,
      });
      this.fileMeta.replaceChildren();
      this.fileMeta.append(
        `${this.filename} · ${sizeKb} kB · `,
        strong(`${parsed.rows.length.toLocaleString("en-US")} rows × ${parsed.columns.length} columns`),
        " detected",
      );
      this.renderPreview(parsed);
      this.errorBox.hidden = true;
      this.importButton.disabled = false;
      this.importButton.textContent =
        `Import ${parsed.rows.length.toLocaleString("en-US")} row${parsed.rows.length === 1 ? "" : "s"}`;
    } catch (err) {
      this.errorBox.textContent = (err as Error)?.message ?? String(err);
      this.errorBox.hidden = false;
      this.preview.replaceChildren();
      this.fileMeta.textContent = `${this.filename} · ${sizeKb} kB`;
      this.importButton.disabled = true;
      this.importButton.textContent = "Import";
    }
  }

  private async submit(): Promise<void> {
    if (!this.onImport || !this.csvText) return;
    const name = sanitizeTableName(this.nameInput.value);
    try {
      const parsed = parseCsv(this.csvText, {
        delimiter: this.delimiter(),
        hasHeader: this.headerCheckbox.checked,
      });
      this.importButton.disabled = true;
      await this.onImport({
        tableName: name,
        script: buildImportScript(name, parsed),
        csvText: this.csvText,
        delimiter: this.delimiter(),
        hasHeader: this.headerCheckbox.checked,
        rows: parsed.rows.length,
      });
    } catch (err) {
      this.showError((err as Error)?.message ?? String(err));
      this.importButton.disabled = false;
    }
  }

  private showError(message: string): void {
    this.errorBox.textContent = message;
    this.errorBox.hidden = false;
  }

  private delimiter(): string {
    const value = this.delimiterSelect.value;
    return value === "\\t" ? "\t" : value;
  }

  private renderPreview(parsed: ParsedCsv): void {
    const table = document.createElement("table");
    const headRow = document.createElement("tr");
    for (const column of parsed.columns) {
      const th = document.createElement("th");
      th.textContent = column;
      headRow.append(th);
    }
    table.append(headRow);

    const shown = parsed.rows.slice(0, 5);
    for (const row of shown) {
      const tr = document.createElement("tr");
      for (const value of row) {
        const td = document.createElement("td");
        td.textContent = value === "" ? "NULL" : value;
        if (value === "") td.className = "null";
        tr.append(td);
      }
      table.append(tr);
    }
    this.preview.replaceChildren(table);
  }
}

/** Pick whichever candidate delimiter appears most in the first line. */
export function detectDelimiter(text: string): string {
  const newlineAt = text.indexOf("\n");
  const firstLine = newlineAt === -1 ? text : text.slice(0, newlineAt);
  let best = ",";
  let bestCount = -1;
  for (const candidate of [",", ";", "\t"]) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best === "\t" ? "\\t" : best;
}

function strong(text: string): HTMLElement {
  const el = document.createElement("b");
  el.textContent = text;
  return el;
}
