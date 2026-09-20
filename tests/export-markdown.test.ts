import { describe, expect, it } from "vitest";
import { eventsToMarkdown } from "../src/bench-kit/export-markdown";
import type { QueryEvent, WorkbenchEvent } from "../src/bench-kit/journal";

function query(overrides: Partial<QueryEvent> = {}): QueryEvent {
  return {
    id: overrides.id ?? "q1",
    type: "query",
    ts: overrides.ts ?? Date.UTC(2026, 7, 22, 10, 30),
    fixture: "ecommerce",
    sql: overrides.sql ?? "SELECT COUNT(*) FROM orders;",
    ok: true,
    rows: 12,
    ms: 3,
    ...overrides,
  } as QueryEvent;
}

describe("eventsToMarkdown", () => {
  it("groups runs by day, newest day first, chronological within a day", () => {
    const events: WorkbenchEvent[] = [
      // later day first in input…
      query({ id: "d2a", ts: Date.UTC(2026, 7, 23, 9, 0), sql: "SELECT latest;" }),
      query({ id: "d1b", ts: Date.UTC(2026, 7, 22, 11, 0), sql: "SELECT second_of_day;" }),
      query({ id: "d1a", ts: Date.UTC(2026, 7, 22, 10, 0), sql: "SELECT first_of_day;" }),
    ];

    const md = eventsToMarkdown(events, Date.UTC(2026, 7, 23, 9, 5));

    expect(md).toContain("# SQL practice — exported");
    const d2 = md.indexOf("## 2026-08-23");
    const d1 = md.indexOf("## 2026-08-22");
    expect(d2).toBeGreaterThan(-1);
    expect(d1).toBeGreaterThan(d2); // newest day section first
    expect(md.indexOf("first_of_day")).toBeLessThan(md.indexOf("second_of_day")); // chronological within day
  });

  it("renders successful runs with ✓, rows and ms inside fenced SQL", () => {
    const md = eventsToMarkdown([query()]);
    expect(md).toContain("✓ 12 rows · 3 ms");
    expect(md).toMatch(/```sql\nSELECT COUNT\(\*\) FROM orders;\n```/);
  });

  it("renders failed runs with ✗ and the verbatim error", () => {
    const md = eventsToMarkdown([
      query({ ok: false, error: "no such column: regon", sql: "SELECT regon;" }),
    ]);
    expect(md).toContain("✗ no such column: regon");
    expect(md).toContain("SELECT regon;");
    expect(md).not.toContain("✓");
  });

  it("renders csv imports and dataset resets as plain bullets", () => {
    const md = eventsToMarkdown([
      { id: "c1", type: "csv-import", ts: Date.UTC(2026, 7, 22), name: "my_sales", rows: 1204 },
      { id: "r1", type: "dataset-reset", ts: Date.UTC(2026, 7, 22), fixture: "ecommerce" },
    ]);
    expect(md).toContain("- imported CSV **my_sales** (1,204 rows)");
    expect(md).toContain("- reset sample data **ecommerce**");
  });

  it("says so when the journal is empty", () => {
    expect(eventsToMarkdown([])).toMatch(/No practice runs yet/);
  });
});

describe("csv-import-removed events", () => {
  it("renders a removal as a removal, not a reset line (LEARN-226)", () => {
    const md = eventsToMarkdown([
      {
        id: "r1",
        type: "csv-import-removed",
        ts: Date.UTC(2026, 7, 22),
        name: "my_sales",
      } as WorkbenchEvent,
    ]);
    expect(md).toContain("- removed imported table **my_sales**");
    expect(md).not.toContain("reset sample data");
  });
});
