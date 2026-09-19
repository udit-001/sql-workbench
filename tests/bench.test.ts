import { describe, expect, it } from "vitest";
import { Bench, mutatesData, type BenchUi } from "../src/bench-kit/bench";
import { FakeEngine, errorOutcome, okOutcome } from "../src/bench-kit/fake-engine";

function recordingUi(): { ui: BenchUi; events: string[]; outcomes: unknown[] } {
  const events: string[] = [];
  const outcomes: unknown[] = [];
  return {
    events,
    outcomes,
    ui: {
      setRunning(running) {
        events.push(running ? "running" : "idle");
      },
      showOutcome(outcome) {
        events.push("outcome");
        outcomes.push(outcome);
      },
    },
  };
}

describe("Bench orchestrator", () => {
  it("runs the query and hands the outcome to the UI", async () => {
    const engine = new FakeEngine(() => okOutcome({ columns: ["id"], rows: [[1]], ms: 2 }));
    const { ui, events } = recordingUi();
    const bench = new Bench(engine, ui);

    const outcome = await bench.submit("SELECT id FROM customers");

    expect(outcome).toMatchObject({ kind: "ok", rowCount: 1 });
    expect(engine.calls).toEqual(["SELECT id FROM customers"]);
    expect(events).toEqual(["running", "outcome", "idle"]);
  });

  it("surfaces engine errors as outcomes instead of throwing", async () => {
    const engine = new FakeEngine(() => errorOutcome("no such column: regon"));
    const { ui, outcomes } = recordingUi();

    const outcome = await new Bench(engine, ui).submit("SELECT regon");

    expect(outcome).toMatchObject({ kind: "error", message: "no such column: regon" });
    expect(outcomes).toHaveLength(1);
  });

  it("ignores blank queries without touching engine or UI", async () => {
    for (const sql of ["", "   \n\t  "]) {
      const engine = new FakeEngine(() => okOutcome({ columns: [], rows: [] }));
      const { ui, events } = recordingUi();

      const outcome = await new Bench(engine, ui).submit(sql);

      expect(outcome).toBeUndefined();
      expect(engine.calls).toEqual([]);
      expect(events).toEqual([]);
    }
  });

  it("returns to idle even when the engine rejects unexpectedly", async () => {
    const engine = new FakeEngine(() => Promise.reject(new Error("worker gone")));
    const { ui, events } = recordingUi();

    await expect(new Bench(engine, ui).submit("SELECT 1")).rejects.toThrow("worker gone");
    expect(events).toEqual(["running", "idle"]);
  });
});

describe("mutatesData", () => {
  it.each([
    ["SELECT 1", false],
    ["  \n  select id from customers", false],
    ["-- try this\nDELETE FROM customers", true], // comment skipped → DELETE is the first keyword
    ["/* c */ WITH x AS (SELECT 1) SELECT * FROM x", false],
    ["EXPLAIN SELECT 1", false],
    ["VALUES (1)", false],
    ["", false],
    ["   ", false],
    ["DELETE FROM customers", true],
    ["insert into t values (1)", true],
    ["UPDATE t SET x = 1", true],
    ["CREATE TABLE t (id)", true],
    ["DROP TABLE t", true],
    ["PRAGMA user_version = 3", true], // pragma can mutate; assume dirty
    // First-statement heuristic, pinned deliberately: a leading SELECT
    // followed by a hidden DELETE is out of scope for a UI classifier.
    ["SELECT 1; DELETE FROM customers", false],
  ])("classifies %j as mutates=%j", (sql, expected) => {
    expect(mutatesData(sql)).toBe(expected);
  });
});

describe("Bench dirty tracking", () => {
  it("marks dirty on mutation attempts, clears on markSeeded", async () => {
    const engine = new FakeEngine(() => okOutcome({ columns: [], rows: [] }));
    const { ui } = recordingUi();
    const bench = new Bench(engine, ui);

    expect(bench.dirtySinceSeed).toBe(false);
    await bench.submit("SELECT 1");
    expect(bench.dirtySinceSeed).toBe(false);
    await bench.submit("DELETE FROM customers");
    expect(bench.dirtySinceSeed).toBe(true);
    await bench.submit(""); // blank no-op doesn't dirty
    expect(bench.dirtySinceSeed).toBe(true);
    bench.markSeeded();
    expect(bench.dirtySinceSeed).toBe(false);
  });

  it("marks dirty even when the mutation errors — earlier statements may have applied", async () => {
    const engine = new FakeEngine(() => errorOutcome("near \"bogus\": syntax error"));
    const { ui } = recordingUi();
    const bench = new Bench(engine, ui);

    await bench.submit("INSERT INTO t VALUES (1); bogus");
    expect(bench.dirtySinceSeed).toBe(true);
  });
});
