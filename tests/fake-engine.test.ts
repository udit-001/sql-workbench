import { describe, expect, it } from "vitest";
import { FakeEngine, errorOutcome, okOutcome } from "../src/bench-kit/fake-engine";

describe("outcome factories", () => {
  it("okOutcome carries columns and rows", () => {
    const outcome = okOutcome({
      columns: ["id", "name"],
      rows: [[1, "ada"], [2, null]],
      ms: 3,
    });
    expect(outcome).toEqual({
      kind: "ok",
      columns: ["id", "name"],
      rows: [[1, "ada"], [2, null]],
      rowCount: 2,
      truncated: false,
      ms: 3,
    });
  });

  it("errorOutcome wraps a verbatim message", () => {
    expect(errorOutcome("no such table: foo")).toEqual({
      kind: "error",
      message: "no such table: foo",
    });
  });
});

describe("FakeEngine", () => {
  it("returns the configured handler's outcome and records the call", async () => {
    const engine = new FakeEngine((sql) =>
      sql.includes("customers")
        ? okOutcome({ columns: ["id"], rows: [[1]], ms: 1 })
        : errorOutcome(`no such table: ${sql}`),
    );

    const hit = await engine.run("SELECT * FROM customers");
    expect(hit).toMatchObject({ kind: "ok", rowCount: 1 });

    const miss = await engine.run("SELECT * FROM nope");
    expect(miss).toMatchObject({ kind: "error" });

    expect(engine.calls).toEqual([
      "SELECT * FROM customers",
      "SELECT * FROM nope",
    ]);
  });

  it("awaits async handlers so tests can simulate latency ordering", async () => {
    let resolved = false;
    const engine = new FakeEngine(async () => {
      await new Promise((r) => setTimeout(r, 5));
      resolved = true;
      return okOutcome({ columns: [], rows: [], ms: 5 });
    });

    const pending = engine.run("SELECT 1");
    expect(resolved).toBe(false);
    await pending;
    expect(resolved).toBe(true);
  });
});
