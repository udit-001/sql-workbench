import type { DiagramNode, Relation, SchemaTable } from "../bench-kit/schema";

/**
 * Entity diagram (LEARN-209), hand-rolled SVG following the
 * diagram-design language (MIT, cathrynlavery/diagram-design):
 * borders-only — never shadows; 4px grid; header band + hairline;
 * exactly 24px column rows; orthogonal rounded elbows; arrows drawn
 * before boxes; mono for technical text. Colors resolve through our
 * Nord CSS variables so light/dark come free.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const BOX_W = 240;
const HEADER_H = 28;
const ROW_H = 24;
const MAX_ROWS = 10;
const GAP_X = 48;
const GAP_Y = 24;
const MARGIN = 20;

export class DiagramPane {
  private fkColumns = new Map<string, Set<string>>();

  constructor(
    private readonly container: HTMLElement,
    private readonly onInsertColumn: (column: string) => void,
  ) {}

  render(nodes: DiagramNode[], relations: Relation[]): void {
    if (nodes.length === 0) {
      this.container.replaceChildren();
      return;
    }
    this.fkColumns = collectFkColumns(relations);

    // One vertical stack per layer; canvas sized by the tallest stack.
    const stacks = new Map<number, DiagramNode[]>();
    for (const node of [...nodes].sort(byLayerThenName)) {
      const stack = stacks.get(node.layer);
      if (stack) stack.push(node);
      else stacks.set(node.layer, [node]);
    }

    const positions = new Map<string, Box>();
    let maxStackHeight = 0;
    let maxLayer = 0;
    for (const [layer, stack] of stacks) {
      let y = MARGIN;
      for (const node of stack) {
        const rows = Math.min(node.table.columns.length, MAX_ROWS);
        const height = HEADER_H + rows * ROW_H + 8;
        positions.set(node.table.name, {
          x: MARGIN + layer * (BOX_W + GAP_X),
          y,
          height,
          table: node.table,
        });
        y += height + GAP_Y;
      }
      maxStackHeight = Math.max(maxStackHeight, y - GAP_Y);
      maxLayer = Math.max(maxLayer, layer);
    }

    const width = MARGIN * 2 + (maxLayer + 1) * BOX_W + maxLayer * GAP_X;
    const height = Math.max(maxStackHeight, HEADER_H * 2) + MARGIN;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.classList.add("diagram-svg");
    svg.append(markerDefs());

    // Attach first so text measurement works while building.
    this.container.replaceChildren(svg);

    // Arrows before boxes — the boxes paint over the line ends.
    for (const relation of relations) {
      const path = this.edgePath(relation, positions);
      if (path) svg.append(path);
    }
    for (const box of positions.values()) {
      this.tableBox(svg, box);
    }
  }

  private edgePath(
    relation: Relation,
    positions: Map<string, Box>,
  ): SVGPathElement | null {
    const source = positions.get(relation.from.table);
    const target = positions.get(relation.to.table);
    if (!source || !target) return null;

    let d: string;
    if (source === target) {
      d = selfLoop(source);
    } else {
      const goesRight = target.x > source.x;
      const x1 = goesRight ? source.x + BOX_W : source.x;
      const x2 = goesRight ? target.x : target.x + BOX_W;
      d = elbow(x1, rowCentreY(source, relation.from.column), x2, rowCentreY(target, relation.to.column));
    }

    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "diagram-edge");
    path.setAttribute("marker-end", "url(#fk-arrow)");
    path.setAttribute("fill", "none");
    return path;
  }

  private tableBox(svg: SVGSVGElement, box: Box): void {
    const group = document.createElementNS(SVG_NS, "g");
    // Attach before building rows: getComputedTextLength needs the DOM.
    svg.append(group);

    const body = rect(box.x, box.y, BOX_W, box.height);
    body.setAttribute("class", "diagram-box");
    group.append(body);

    const band = rect(box.x, box.y, BOX_W, HEADER_H);
    band.setAttribute("class", "diagram-box-header");
    group.append(band);

    const hairline = line(
      box.x,
      box.y + HEADER_H,
      box.x + BOX_W,
      box.y + HEADER_H,
      "diagram-hairline",
    );
    group.append(hairline);

    const title = text(box.x + 12, box.y + 18, box.table.name, "diagram-title");
    title.style.cursor = "default";
    group.append(title);

    const count = text(
      box.x + BOX_W - 12,
      box.y + 18,
      `${box.table.rowCount.toLocaleString("en-US")} rows`,
      "diagram-tag-text",
    );
    count.setAttribute("text-anchor", "end");
    group.append(count);

    box.table.columns.slice(0, MAX_ROWS).forEach((column, i) => {
      const rowY = box.y + HEADER_H + i * ROW_H;

      if (i % 2 === 1) {
        const zebra = rect(box.x + 1, rowY, BOX_W - 2, ROW_H);
        zebra.setAttribute("class", "diagram-row-zebra");
        zebra.setAttribute("rx", "0");
        group.append(zebra);
      }

      const name = text(box.x + 12, rowY + 16, column.name, "diagram-column");
      name.style.cursor = "pointer";
      name.addEventListener("click", () => this.onInsertColumn(column.name));
      group.append(name);

      const chips = [
        ...(column.pk ? ["PK"] : []),
        ...(this.fkColumns.get(box.table.name)?.has(column.name) ? ["FK"] : []),
      ];
      if (chips.length > 0) {
        // Placed after the measured name so it never overlaps the label.
        const nameWidth = name.getComputedTextLength();
        const label = chips.join(" ");
        const chipW = label.length * 5 + 8;
        const chipRect = rect(box.x + 12 + nameWidth + 8, rowY + 5, chipW, 12);
        chipRect.setAttribute("class", "diagram-chip");
        chipRect.setAttribute("rx", "2");
        const chipTextEl = text(box.x + 12 + nameWidth + 8 + chipW / 2, rowY + 14, label, "diagram-chip-text");
        chipTextEl.setAttribute("text-anchor", "middle");
        group.append(chipRect, chipTextEl);
      }

      const type = text(box.x + BOX_W - 12, rowY + 16, column.type.toLowerCase(), "diagram-type");
      type.setAttribute("text-anchor", "end");
      group.append(type);
    });

    if (box.table.columns.length > MAX_ROWS) {
      group.append(
        text(
          box.x + 12,
          box.y + HEADER_H + MAX_ROWS * ROW_H + 16,
          `+${box.table.columns.length - MAX_ROWS} more columns`,
          "diagram-more",
        ),
      );
    }
  }
}

interface Box {
  x: number;
  y: number;
  height: number;
  table: SchemaTable;
}

function collectFkColumns(relations: Relation[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const rel of relations) {
    const set = map.get(rel.from.table) ?? new Set<string>();
    set.add(rel.from.column);
    map.set(rel.from.table, set);
  }
  return map;
}

function markerDefs(): Element {
  const defs = document.createElementNS(SVG_NS, "defs");
  defs.innerHTML =
    `<marker id="fk-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">` +
    `<polygon points="0 0, 8 3, 0 6" fill="var(--muted)"/></marker>`;
  return defs;
}

function byLayerThenName(a: DiagramNode, b: DiagramNode): number {
  return a.layer - b.layer || a.table.name.localeCompare(b.table.name);
}

/** Centre-y of a named column's row; falls back to mid-body when absent. */
function rowCentreY(box: Box, columnName: string): number {
  const index = box.table.columns.findIndex((c) => c.name === columnName);
  if (index === -1 || index >= MAX_ROWS) {
    return box.y + HEADER_H + Math.min(box.table.columns.length, MAX_ROWS) * ROW_H / 2;
  }
  return box.y + HEADER_H + index * ROW_H + ROW_H / 2;
}

function rect(x: number, y: number, width: number, height: number): SVGRectElement {
  const el = document.createElementNS(SVG_NS, "rect");
  el.setAttribute("x", String(x));
  el.setAttribute("y", String(y));
  el.setAttribute("width", String(width));
  el.setAttribute("height", String(height));
  el.setAttribute("rx", String(6));
  return el;
}

function line(x1: number, y1: number, x2: number, y2: number, cssClass: string): SVGLineElement {
  const el = document.createElementNS(SVG_NS, "line");
  el.setAttribute("x1", String(x1));
  el.setAttribute("y1", String(y1));
  el.setAttribute("x2", String(x2));
  el.setAttribute("y2", String(y2));
  el.setAttribute("class", cssClass);
  return el;
}

function text(x: number, y: number, content: string, cssClass: string): SVGTextElement {
  const el = document.createElementNS(SVG_NS, "text");
  el.setAttribute("x", String(x));
  el.setAttribute("y", String(y));
  el.setAttribute("class", cssClass);
  el.textContent = content;
  return el;
}

/**
 * Horizontal-in → vertical → horizontal-out elbow with 8px rounded
 * corners (diagram-design connector rule); collapses to a straight line
 * when both ends share a row.
 */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y2 - y1) < 1) return `M ${x1},${y1} H ${x2}`;
  const dir = y2 > y1 ? 1 : -1;
  const r = Math.min(8, Math.abs(y2 - y1) / 2);
  const mid = (x1 + x2) / 2;
  return (
    `M ${x1},${y1} H ${mid - r}` +
    ` Q ${mid},${y1} ${mid},${y1 + dir * r}` +
    ` V ${y2 - dir * r}` +
    ` Q ${mid},${y2} ${mid + r},${y2}` +
    ` H ${x2}`
  );
}

/** Self-referencing FK: small loop off the box's right edge. */
function selfLoop(box: Box): string {
  const x = box.x + BOX_W;
  const yMid = box.y + box.height / 2;
  return (
    `M ${x},${yMid - 6} H ${x + 20}` +
    ` Q ${x + 28},${yMid - 6} ${x + 28},${yMid}` +
    ` V ${yMid + 6}` +
    ` Q ${x + 28},${yMid + 18} ${x + 20},${yMid + 18}` +
    ` H ${x}`
  );
}
