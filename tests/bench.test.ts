import { describe, expect, it } from "vitest";
import { Bench, type BenchUi } from "../src/bench-kit/bench";
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
