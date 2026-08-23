/// <reference lib="webworker" />
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { RESULT_ROW_CAP, type Outcome, type SqlValue } from "../engine";

/**
 * Dedicated worker owning the SQLite WASM instance (LEARN-193): memory
 * database, no OPFS/SAB, nothing here touches the DOM. Seed statements are
 * the single source of truth for database state — `load` recreates the
 * memory DB from scratch so the same input always yields the same database.
 */

type WorkerRequest =
  | { id: number; op: "load"; statements: string[] }
  | { id: number; op: "run"; sql: string };

interface DbLike {
  exec(opts: {
    sql: string;
    rowMode: "array";
    columnNames?: string[];
    resultRows?: SqlValue[][];
  }): unknown;
  close(): unknown;
}

type Sqlite3Static = { oo1: { DB: new (options: { filename: string; flags: string }) => DbLike } };
type Sqlite3Init = () => Promise<Sqlite3Static>;

// The module ships its own types; this structural view keeps the worker
// logic honest about exactly the API surface we rely on.
const initSqlite3 = sqlite3InitModule as unknown as Sqlite3Init;

let dbPromise: Promise<Sqlite3Static> | null = null;

function sqlite3(): Promise<Sqlite3Static> {
  // Init once; Emscripten module compilation is the expensive part.
  dbPromise ??= initSqlite3();
  return dbPromise;
}

let db: DbLike | null = null;

function newMemoryDb(sqlite3Static: Sqlite3Static): DbLike {
  return new sqlite3Static.oo1.DB({ filename: ":memory:", flags: "c" });
}

async function getDb(): Promise<DbLike> {
  if (!db) db = newMemoryDb(await sqlite3());
  return db;
}

/** Recreate the memory DB and execute every seed statement, in order. */
async function load(statements: string[]): Promise<void> {
  const sqlite3Static = await sqlite3();
  db?.close();
  db = newMemoryDb(sqlite3Static);
  for (const statement of statements) {
    db.exec({ sql: statement, rowMode: "array" });
  }
}

async function run(sql: string): Promise<Outcome> {
  const database = await getDb();
  const t0 = performance.now();
  const columns: string[] = [];
  const collected: SqlValue[][] = [];
  try {
    database.exec({
      sql,
      rowMode: "array",
      columnNames: columns,
      resultRows: collected,
    });
  } catch (err) {
    // Verbatim SQLite message — part of the Engine seam contract.
    return { kind: "error", message: (err as Error)?.message ?? String(err) };
  }
  const ms = Math.max(1, Math.round(performance.now() - t0));
  const rowCount = collected.length;
  const truncated = rowCount > RESULT_ROW_CAP;
  return {
    kind: "ok",
    columns,
    rows: truncated ? collected.slice(0, RESULT_ROW_CAP) : collected,
    rowCount,
    truncated,
    ms,
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result =
      request.op === "load"
        ? await load(request.statements)
        : await run(request.sql);
    self.postMessage({ id: request.id, ok: true, result });
  } catch (err) {
    // Infrastructural failure (WASM init, crashed DB) — distinct from a
    // SQL error, which `run` reports as an ErrorOutcome instead.
    console.error("[sqlite-worker] request failed", err);
    self.postMessage({
      id: request.id,
      ok: false,
      error: (err as Error)?.message ?? String(err),
    });
  }
};
