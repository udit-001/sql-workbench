import { JOURNAL_MAX_EVENTS, dedupeAndTrim, MemoryJournal, type Journal, type WorkbenchEvent } from "./journal";
import { openKv } from "./idb-kv";

/**
 * Browser journal storage (LEARN-197/203): append-only event log in
 * IndexedDB. All events live in one record so every append runs through
 * the same dedupe-and-trim rule the tests cover — atomic and simple at
 * teaching scale. Falls back to MemoryJournal when IndexedDB is
 * unavailable: the session still journals, it just doesn't persist.
 */

const KEY = "journal-events";

export async function openJournal(): Promise<Journal> {
  try {
    const kv = await openKv();
    return {
      async append(event) {
        const existing = (await kv.get<WorkbenchEvent[]>(KEY)) ?? [];
        const next = dedupeAndTrim(existing, event, JOURNAL_MAX_EVENTS);
        if (next !== existing) await kv.put(KEY, next); // duplicate id → no-op
      },
      async list() {
        return [...((await kv.get<WorkbenchEvent[]>(KEY)) ?? [])].reverse();
      },
    };
  } catch (err) {
    console.warn("[sql-workbench] journal falling back to memory", err);
    return new MemoryJournal();
  }
}
