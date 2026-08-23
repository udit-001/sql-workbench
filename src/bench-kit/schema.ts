import type { Engine } from "./engine";

export interface SchemaColumn {
  name: string;
  /** Declared type as written in the CREATE TABLE, "" when untyped. */
  type: string;
  /** Part of the PRIMARY KEY (from PRAGMA table_info's pk flag). */
  pk?: boolean;
}

export interface SchemaTable {
  name: string;
  rowCount: number;
  columns: SchemaColumn[];
  /** Set by the app layer: learner-imported CSV tables get a badge + ✕. */
  yours?: boolean;
  yoursTitle?: string;
}

export interface Relation {
  from: { table: string; column: string };
  to: { table: string; column: string };
}

/**
 * Introspect the engine's current database through the public Engine seam —
 * plain SELECTs and PRAGMAs, no new Engine surface — so the schema panel
 * works identically against WasmEngine and FakeEngine.
 */
export async function loadSchema(engine: Engine): Promise<SchemaTable[]> {
  const names = await engine.run(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  );
  if (names.kind === "error") throw new Error(names.message);

  const tables: SchemaTable[] = [];
  for (const [name] of names.rows) {
    const table = String(name);

    const info = await engine.run(`PRAGMA table_info(${quoteIdent(table)})`);
    if (info.kind === "error") throw new Error(info.message);
    const columns = info.rows.map((row) => ({
      name: String(row[1]),
      type: row[2] === null ? "" : String(row[2]),
      pk: Number(row[5] ?? 0) > 0,
    }));

    const count = await engine.run(`SELECT COUNT(*) FROM ${quoteIdent(table)}`);
    if (count.kind === "error") throw new Error(count.message);
    const rowCount = Number(count.rows[0]?.[0] ?? 0);

    tables.push({ name: table, rowCount, columns });
  }
  return tables;
}

/**
 * Foreign-key edges via `PRAGMA foreign_key_list`, through the public
 * Engine seam. An implicit reference (REFERENCES parent without a target
 * column) yields an empty `to.column` — the renderer anchors to the box.
 */
export async function loadRelations(engine: Engine): Promise<Relation[]> {
  const names = await engine.run(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  if (names.kind === "error") throw new Error(names.message);

  const relations: Relation[] = [];
  for (const [name] of names.rows) {
    const table = String(name);
    const fks = await engine.run(`PRAGMA foreign_key_list(${quoteIdent(table)})`);
    if (fks.kind === "error") throw new Error(fks.message);
    // row shape: [id, seq, table, from, to, on_update, on_delete, match]
    for (const row of fks.rows) {
      relations.push({
        from: { table, column: String(row[3] ?? "") },
        to: {
          table: String(row[2] ?? ""),
          column: row[4] === null || row[4] === undefined ? "" : String(row[4]),
        },
      });
    }
  }
  return relations;
}

/** Double-quoted SQL identifier, internal quotes doubled. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** A table placed in the diagram's layered layout. */
export interface DiagramNode {
  table: SchemaTable;
  /** Column index in the diagram: referenced parents sit left (0). */
  layer: number;
}

const MAX_LAYERS = 8; // safety net for pathological FK graphs

/**
 * Layer tables so every referenced (parent) table sits strictly left of
 * its referencing children — longest-path over FK edges, with cycle and
 * self-reference guards so nothing loops forever. Unrelated tables land
 * at layer 0 alongside roots.
 */
export function layoutTables(tables: SchemaTable[], relations: Relation[]): DiagramNode[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const layers = new Map<string, number>();
  const inProgress = new Set<string>();

  function layerOf(name: string, depth = 0): number {
    const known = layers.get(name);
    if (known !== undefined) return known;
    if (inProgress.has(name) || depth > MAX_LAYERS) return 0; // cycle guard
    inProgress.add(name);
    let layer = 0;
    for (const rel of relations) {
      if (rel.from.table === name && rel.to.table !== name && byName.has(rel.to.table)) {
        layer = Math.max(layer, layerOf(rel.to.table, depth + 1) + 1);
      }
    }
    inProgress.delete(name);
    layers.set(name, layer);
    return layer;
  }

  return tables.map((table) => ({ table, layer: layerOf(table.name) }));
}
