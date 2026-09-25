import { describe, expect, it } from "vitest";
import {
  JOURNAL_MAX_EVENTS,
  MemoryJournal,
  dedupeAndTrim,
  type QueryEvent,
} from "../src/bench-kit/journal";

function queryEvent(overrides: Partial<QueryEvent> = {}): QueryEvent {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    type: "query",
    ts: overrides.ts ?? 1_700_000_000_000,
    fixture: overrides.fixture ?? "ecommerce",
    sql: overrides.sql ?? "SELECT 1;",
    ok: overrides.ok ?? true,
    ...(overrides.ok === false ? { error: "no such column: regon" } : { rows: 1, ms: 2 }),
    ...overrides,
  } as QueryEvent;
}

describe("MemoryJournal", () => {
  it("appends events and lists them newest-first", async () => {
    const journal = new MemoryJournal();
    await journal.append(queryEvent({ id: "a", ts: 1000 }));
    await journal.append(queryEvent({ id: "b", ts: 2000 }));

    const listed = await journal.list();
    expect(listed.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("deduplicates by id so transport retries never double-record", async () => {
    const journal = new MemoryJournal();
    await journal.append(queryEvent({ id: "same" }));
    await journal.append(queryEvent({ id: "same" }));

    expect(await journal.list()).toHaveLength(1);
  });

  it("keeps only the newest 2000 events, dropping oldest", async () => {
    const journal = new MemoryJournal();
    for (let i = 0; i < JOURNAL_MAX_EVENTS + 50; i++) {
      await journal.append(queryEvent({ id: `e${i}` }));
    }

    const listed = await journal.list();
    expect(listed).toHaveLength(JOURNAL_MAX_EVENTS);
    expect(listed[0]?.id).toBe(`e${JOURNAL_MAX_EVENTS + 49}`); // newest survives
    expect(listed.at(-1)?.id).toBe("e50"); // e0..e49 dropped
  });
});

describe("dedupeAndTrim", () => {
  it("returns existing untouched when incoming is a duplicate", () => {
    const existing = [queryEvent({ id: "a" })];
    expect(dedupeAndTrim(existing, queryEvent({ id: "a" }), 10)).toEqual(existing);
  });

  it("appends and trims beyond the cap", () => {
    const existing = [
      queryEvent({ id: "a" }),
      queryEvent({ id: "b" }),
      queryEvent({ id: "c" }),
    ];
    const next = dedupeAndTrim(existing, queryEvent({ id: "d" }), 3);
    expect(next.map((e) => e.id)).toEqual(["b", "c", "d"]);
  });
});

describe("StepEvent (LEARN-236)", () => {
  it("flows through MemoryJournal and dedupeAndTrim like any event", async () => {
    const journal = new MemoryJournal();
    const step = {
      id: "s1",
      type: "step" as const,
      ts: 5_000,
      fixture: "books",
      title: "Books nobody reviewed",
      concept: "left-join",
      outcome: "miss" as const,
    };
    await journal.append(step);
    await journal.append(step); // retry — deduped by id

    const listed = await journal.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ type: "step", outcome: "miss", concept: "left-join" });
  });
});
