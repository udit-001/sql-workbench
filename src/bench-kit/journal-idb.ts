import {
  JOURNAL_MAX_EVENTS,
  dedupeAndTrim,
  MemoryJournal,
  type Journal,
  type WorkbenchEvent,
} from "./journal";

/**
 * Browser journal storage: append-only event log in IndexedDB (LEARN-197).
 * All events live in one record so every append runs through the same
 * dedupe-and-trim rule the tests cover — atomic and simple at teaching
 * scale. If IndexedDB is unavailable (private windows etc.) openJournal()
 * falls back to a MemoryJournal: the session still journals, it just
 * doesn't persist.
 */

const DB_NAME = "sql-workbench";
const DB_VERSION = 1;
const STORE = "kv";
const KEY = "journal-events";

type StoredEvents = WorkbenchEvent[];

export async function openJournal(): Promise<Journal> {
  try {
    return await IndexedDBJournal.open();
  } catch (err) {
    console.warn("[sql-workbench] IndexedDB unavailable — journal will not persist", err);
    return new MemoryJournal();
  }
}

export class IndexedDBJournal implements Journal {
  static open(): Promise<IndexedDBJournal> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB not available"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(new IndexedDBJournal(request.result));
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });
  }

  private constructor(private readonly db: IDBDatabase) {}

  async append(event: WorkbenchEvent): Promise<void> {
    const existing = (await this.get()) ?? [];
    const next = dedupeAndTrim(existing, event, JOURNAL_MAX_EVENTS);
    if (next !== existing) await this.put(next); // duplicate id → no-op
  }

  /** Newest first. */
  async list(): Promise<WorkbenchEvent[]> {
    return [...((await this.get()) ?? [])].reverse();
  }

  private get(): Promise<StoredEvents | undefined> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result as StoredEvents | undefined);
      request.onerror = () => reject(request.error ?? new Error("journal read failed"));
    });
  }

  private put(events: StoredEvents): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(events, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("journal write failed"));
      tx.onabort = () => reject(tx.error ?? new Error("journal write aborted"));
    });
  }
}
