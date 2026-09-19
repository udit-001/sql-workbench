import { openKv } from "./idb-kv";

/**
 * Persistence for learner-imported CSV tables (LEARN-204). The raw CSV
 * text is kept so every boot — and every Reset — can replay the import
 * into the fresh memory database; that's what makes imported tables
 * survive reloads standalone. Stored under its own key in the shared
 * bench store.
 */

const KEY = "csv-tables";

export interface ImportedTable {
  /** Sanitized SQL table name (unique key for this list). */
  name: string;
  /** Original filename, shown in the schema panel tooltip. */
  filename: string;
  csvText: string;
  delimiter: string;
  hasHeader: boolean;
  rows: number;
  importedAt: number;
}

export async function listImportedTables(namespace?: string): Promise<ImportedTable[]> {
  const kv = await openKv(namespace);
  return ((await kv.get<ImportedTable[]>(KEY)) ?? []).slice();
}

export async function saveImportedTable(table: ImportedTable, namespace?: string): Promise<void> {
  const kv = await openKv(namespace);
  const tables = (await kv.get<ImportedTable[]>(KEY)) ?? [];
  const next = [...tables.filter((t) => t.name !== table.name), table];
  await kv.put(KEY, next);
}

export async function deleteImportedTable(name: string, namespace?: string): Promise<void> {
  const kv = await openKv(namespace);
  const tables = (await kv.get<ImportedTable[]>(KEY)) ?? [];
  await kv.put(
    KEY,
    tables.filter((t) => t.name !== name),
  );
}
