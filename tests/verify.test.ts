import { describe, expect, it } from "vitest";
import { matchExpectation, type Expectation } from "../src/bench-kit/verify";
import type { Outcome, QueryOutcome } from "../src/bench-kit/engine";

function okResult(
  columns: string[],
  rows: (string | number | bigint | null)[][],
  overrides: Partial<QueryOutcome> = {},
): Outcome {
  return {
    kind: "ok",
    columns,
    rows: rows as QueryOutcome["rows"],
    rowCount: rows.length,
    truncated: false,
    ms: 3,
    ...overrides,
  };
}

describe("matchExpectation — rows", () => {
  const expect2: Expectation = { rows: [["Ada", 2], ["Grace", 1]] };

  it("passes on an exact match", () => {
    expect(matchExpectation(okResult(["name", "n"], [["Ada", 2], ["Grace", 1]]), expect2)).toEqual({ ok: true });
  });

  it("passes regardless of row order unless order is required", () => {
    expect(matchExpectation(okResult(["name", "n"], [["Grace", 1], ["Ada", 2]]), expect2)).toEqual({ ok: true });
    expect(
      matchExpectation(okResult(["name", "n"], [["Grace", 1], ["Ada", 2]]), { ...expect2, order: true }).ok,
    ).toBe(false);
  });

  it("normalizes numeric shapes: 460.0 vs 460 and REAL vs INTEGER compare equal", () => {
    expect(
      matchExpectation(okResult(["v"], [[460]]), { rows: [[460.0]] }),
    ).toEqual({ ok: true });
    expect(
      matchExpectation(okResult(["v"], [["460"]]), { rows: [[460]] }),
    ).toEqual({ ok: true });
  });

  it("passes on the same rows in different columns layout only when columns align", () => {
    // Column NAMES are optional: identical values pass with different names.
    expect(matchExpectation(okResult(["x", "y"], [["Ada", 2]]), { rows: [["Ada", 2]] })).toEqual({ ok: true });
    expect(
      matchExpectation(okResult(["x", "y"], [["Ada", 2]]), { rows: [["Ada", 2]], columns: ["name", "n"] }),
    ).toEqual({ ok: false, kind: "columns", detail: "result columns are [x, y], expected [name, n]" });
  });

  it("fails with a count reason when row counts differ", () => {
    const r = matchExpectation(okResult(["name"], [["Ada"], ["Grace"]]), { rows: [["Ada"]] });
    expect(r).toEqual({ ok: false, kind: "count", detail: "query returned 2 rows, expected 1" });
  });

  it("fails with a row reason naming the first differing row", () => {
    const r = matchExpectation(okResult(["name"], [["Ada"], ["Grace"]]), { rows: [["Ada"], ["Grxce"]] });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ kind: "rows", detail: "row 2 differs — expected (Grxce), got (Grace)" });
  });

  it("fails truncated results by count before any row comparison", () => {
    const r = matchExpectation(
      okResult(["name"], [["A"], ["B"], ["C"]], { rowCount: 3, truncated: true, rows: [["A"]] }),
      { rows: [["A"], ["B"]] },
    );
    // rows normalized from the capped slice → length 1 vs 2: count reason,
    // and the detail quotes the TRUE rowCount (3), not the capped slice.
    expect(r).toEqual({ ok: false, kind: "count", detail: "query returned 3 rows, expected 2" });
  });
});

describe("matchExpectation — expected errors", () => {
  it("passes when the run fails with the tested verbatim error (substring)", () => {
    const outcome: Outcome = { kind: "error", message: "no such column: regon" };
    expect(matchExpectation(outcome, { rows: [], error: "no such column" })).toEqual({ ok: true });
  });

  it("fails when a different error occurs, quoting nothing (verbatim surfaces elsewhere)", () => {
    const r = matchExpectation({ kind: "error", message: "syntax error" }, { rows: [], error: "no such column" });
    expect(r).toEqual({ ok: false, kind: "error", detail: "failed with a different error than this problem tests for" });
  });

  it("fails when the problem expects failure but the run succeeds", () => {
    const r = matchExpectation(okResult(["x"], [[1]]), { rows: [], error: "no such column" });
    expect(r).toEqual({ ok: false, kind: "error", detail: "the problem expects a query failure — this run succeeded" });
  });
});

describe("matchExpectation — query errored against a rows test", () => {
  it("misses with a rows reason instead of crashing", () => {
    const r = matchExpectation({ kind: "error", message: "no such table: books" }, { rows: [["x"]] });
    expect(r).toEqual({ ok: false, kind: "rows", detail: "the query failed before producing rows" });
  });
});
