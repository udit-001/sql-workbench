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
  /** Who drove the run (LEARN-236): omitted on legacy events = learner. */
  actor?: "learner" | "agent";
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

/** One graded attempt on a problem slot (LEARN-236). The attempt's SQL
 *  and any verbatim error live in the paired query event; the step event
 *  carries the pedagogy: which problem, what concept, what happened. */
export interface StepEvent {
  id: string;
  type: "step";
  ts: number;
  fixture: string;
  /** Problem title, when the element declared one. */
  title?: string;
  concept?: string;
  outcome: "pass" | "miss";
  /** Who attempted (LEARN-236): agent = author pre-flight/verify runs. */
  actor?: "learner" | "agent";
}

export type WorkbenchEvent = QueryEvent | CsvImportEvent | CsvImportRemovedEvent | DatasetResetEvent | StepEvent;

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
