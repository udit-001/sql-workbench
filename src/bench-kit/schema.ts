import type { Engine } from "./engine";

export interface SchemaColumn {
  name: string;
  /** Declared type as written in the CREATE TABLE, "" when untyped. */
  type: string;
}

export interface SchemaTable {
  name: string;
  rowCount: number;
  columns: SchemaColumn[];
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
    }));

    const count = await engine.run(`SELECT COUNT(*) FROM ${quoteIdent(table)}`);
    if (count.kind === "error") throw new Error(count.message);
    const rowCount = Number(count.rows[0]?.[0] ?? 0);

    tables.push({ name: table, rowCount, columns });
  }
  return tables;
}

/** Double-quoted SQL identifier, internal quotes doubled. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
