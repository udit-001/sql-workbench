import type { SchemaTable } from "../bench-kit/schema";
import { formatCount } from "../bench-kit/format";

/**
 * Left panel listing the loaded dataset's tables with row counts
 * (spec user story 3) and click-to-insert column names (story 4).
 */
export class SchemaPanel {
  constructor(
    private readonly container: HTMLElement,
    private readonly onInsertColumn: (column: string) => void,
    private readonly onRemoveTable?: (table: string) => void,
  ) {}

  render(tables: SchemaTable[], datasetTitle: string): void {
    this.container.replaceChildren();

    const label = document.createElement("div");
    label.className = "ds-label";
    label.textContent = `Tables · ${datasetTitle}`;
    this.container.append(label);

    if (tables.length === 0) {
      const empty = document.createElement("div");
      empty.className = "schema-empty";
      empty.textContent = "No tables yet — run some CREATE TABLE statements.";
      this.container.append(empty);
      return;
    }

    for (const table of tables) {
      const block = document.createElement("div");
      block.className = "tbl open";

      const header = document.createElement("button");
      header.type = "button";
      const chev = document.createElement("span");
      chev.className = "chev";
      chev.textContent = "▶";
      const name = document.createElement("span");
      name.className = "tbl-name";
      name.textContent = table.name;
      if (table.yours) {
        name.title = table.yoursTitle ?? "Imported from your CSV — saved in this browser";
        const badge = document.createElement("span");
        badge.className = "badge-you";
        badge.textContent = "yours";
        header.append(chev, name, badge);
        const remove = document.createElement("span");
        remove.className = "col-del";
        remove.textContent = "✕";
        remove.title = `Remove ${table.name} and its stored CSV`;
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          this.onRemoveTable?.(table.name);
        });
        header.append(remove);
      } else {
        header.append(chev, name);
      }
      const count = document.createElement("span");
      count.className = "ty";
      count.title = "rows in table";
      count.style.marginLeft = "auto";
      count.textContent = formatCount(table.rowCount);
      header.append(count);
      header.addEventListener("click", () => {
        block.classList.toggle("open");
        this.measureCols(cols);
      });

      const cols = document.createElement("div");
      cols.className = "cols";
      for (const column of table.columns) {
        const col = document.createElement("button");
        col.type = "button";
        col.className = "col";
        col.title = `Insert ${column.name}`;
        const colName = document.createElement("span");
        colName.className = "col-name";
        colName.textContent = column.name;
        const colType = document.createElement("span");
        colType.className = "ty";
        colType.textContent = column.type;
        col.append(colName, colType);
        col.addEventListener("click", () => this.onInsertColumn(column.name));
        cols.append(col);
      }

      block.append(header, cols);
      // Blocks render open — measure once the column rows are in the DOM
      // so --cols-h matches real content height from the first paint.
      this.measureCols(cols);
      this.container.append(block);
    }
  }

  /**
   * Write the open-state height of a `.cols` list to its `--cols-h`
   * custom property so the max-height transition (styles.css, `.cols`)
   * grows exactly to content instead of a guessed value. Called on mount
   * (blocks start open) and on every toggle. Layout reads are batched
   * per toggle — one forced reflow per click is fine here.
   */
  private measureCols(cols: HTMLElement): void {
    // Temporarily open to measure content height regardless of state.
    const wasOpen = cols.parentElement?.classList.contains("open") ?? true;
    const block = cols.parentElement;
    if (block && !wasOpen) block.classList.add("open");
    const h = cols.scrollHeight;
    if (block && !wasOpen) block.classList.remove("open");
    cols.style.setProperty("--cols-h", `${h}px`);
  }
}
