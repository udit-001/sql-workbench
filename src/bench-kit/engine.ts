/**
 * The Engine seam (LEARN-200): the bench's only way to execute SQL.
 * Adapters: FakeEngine (tests), WasmEngine (@sqlite.org/sqlite-wasm in a
 * dedicated worker, memory DB).
 *
 * Callers never see SQLite's API — only `run(sql) → Outcome`. Verbatim
 * engine error messages are part of the contract: they are what the learner
 * learns from and what the journal later feeds to the agent.
 */

/** A single cell value as SQLite reports it. */
export type SqlValue = string | number | bigint | Uint8Array | null;

export interface QueryOutcome {
  kind: "ok";
  /** Result column names, empty for non-SELECT statements. */
  columns: string[];
  /** Rows capped at RESULT_ROW_CAP; each row aligns with `columns`. */
  rows: SqlValue[][];
  /** Total rows in the full result set, before capping. */
  rowCount: number;
  /** True when rowCount exceeds RESULT_ROW_CAP and rows was cut short. */
  truncated: boolean;
  /** Wall-clock execution time in milliseconds. */
  ms: number;
}

export interface ErrorOutcome {
  kind: "error";
  /** Verbatim engine message, e.g. `no such column: regon`. */
  message: string;
}

export type Outcome = QueryOutcome | ErrorOutcome;

export interface Engine {
  run(sql: string): Promise<Outcome>;
}

/** Maximum rows the engine returns in one outcome; rowCount reports the true total. */
export const RESULT_ROW_CAP = 500;
