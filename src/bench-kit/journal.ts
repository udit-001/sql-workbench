/**
 * Journal seam (LEARN-197): append-only local event log — the agent's eyes
 * on real practice. Events are plain JSON, `id`-deduped on retry, newest
 * 2,000 kept. Adapters: MemoryJournal (tests), IndexedDBJournal (browser).
 */

export type QueryEvent = {
  id: string;
  type: "query";
  /** Epoch milliseconds. */
  ts: number;
  fixture: string;
  sql: string;
} & (
  | { ok: true; rows: number; ms: number }
  | { ok: false; error: string }
);

export interface CsvImportEvent {
  id: string;
  type: "csv-import";
  ts: number;
  name: string;
  rows: number;
}

export interface DatasetResetEvent {
  id: string;
  type: "dataset-reset";
  ts: number;
  fixture: string;
}

export interface CsvImportRemovedEvent {
  id: string;
  type: "csv-import-removed";
  ts: number;
  /** The SQL table name that was removed (same `name` the creating csv-import used). */
  name: string;
}

export type WorkbenchEvent = QueryEvent | CsvImportEvent | CsvImportRemovedEvent | DatasetResetEvent;

export const JOURNAL_MAX_EVENTS = 2000;

export interface Journal {
  append(event: WorkbenchEvent): Promise<void>;
  /** Newest first. */
  list(): Promise<WorkbenchEvent[]>;
}

/**
 * Shared journal logic: skip ids already stored (transport retries are
 * idempotent) and keep only the newest `cap` events. Both adapters run
 * their storage through this so tests cover the real rules.
 */
export function dedupeAndTrim(
  existing: WorkbenchEvent[],
  incoming: WorkbenchEvent,
  cap: number,
): WorkbenchEvent[] {
  if (existing.some((e) => e.id === incoming.id)) return existing;
  const next = [...existing, incoming];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export class MemoryJournal implements Journal {
  private events: WorkbenchEvent[] = [];

  async append(event: WorkbenchEvent): Promise<void> {
    this.events = dedupeAndTrim(this.events, event, JOURNAL_MAX_EVENTS);
  }

  async list(): Promise<WorkbenchEvent[]> {
    return [...this.events].reverse();
  }
}
