import type { SchemaTable } from "../bench-kit/schema";

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
      count.textContent = table.rowCount.toLocaleString("en-US");
      header.append(count);
      header.addEventListener("click", () => block.classList.toggle("open"));

      const cols = document.createElement("div");
      cols.className = "cols";
      for (const column of table.columns) {
        const col = document.createElement("button");
        col.type = "button";
        col.className = "col";
        col.title = `Insert ${column.name}`;
        const colName = document.createElement("span");
        colName.textContent = column.name;
        const colType = document.createElement("span");
        colType.className = "ty";
        colType.textContent = column.type;
        col.append(colName, colType);
        col.addEventListener("click", () => this.onInsertColumn(column.name));
        cols.append(col);
      }

      block.append(header, cols);
      this.container.append(block);
    }
  }
}
