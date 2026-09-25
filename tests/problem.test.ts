import { describe, expect, it } from "vitest";
import { gradeProblem, parseProblem } from "../src/bench-kit/problem";
import type { Outcome, QueryOutcome } from "../src/bench-kit/engine";

function okResult(rows: (string | number | null)[][]): Outcome {
  return {
    kind: "ok",
    columns: ["name"],
    rows: rows as QueryOutcome["rows"],
    rowCount: rows.length,
    truncated: false,
    ms: 2,
  };
}

describe("parseProblem", () => {
  it("parses a full declarative surface", () => {
    const p = parseProblem({
      title: "Books nobody reviewed",
      concept: "left-join",
      prompt: "Find every book with no reviews.",
      test: '[["The Pragmatic Programmer"]]',
      starter: "SELECT ...",
    });
    expect(p.title).toBe("Books nobody reviewed");
    expect(p.concept).toBe("left-join");
    expect(p.prompt).toBe("Find every book with no reviews.");
    expect(p.starter).toBe("SELECT ...");
    expect(p.test).toEqual({ rows: [["The Pragmatic Programmer"]] });
  });

  it("omits absent fields instead of carrying empty strings", () => {
    const p = parseProblem({ test: "[[]]" });
    expect(Object.keys(p)).toEqual(["test"]);
  });

  it("throws with copy naming the attribute when test is missing", () => {
    expect(() => parseProblem({})).toThrow('missing required attribute "test"');
  });

  it("throws naming the attribute on invalid JSON", () => {
    expect(() => parseProblem({ test: '[["Ada",]]' })).toThrow('"test" attribute is not valid JSON');
  });

  it("throws when test is not an array of rows", () => {
    expect(() => parseProblem({ test: '"Ada"' })).toThrow('"test" attribute must be an array of rows');
    expect(() => parseProblem({ test: '["Ada"]' })).toThrow('"test" attribute rows must be arrays');
  });

  it("accepts an empty rows array (a test that expects zero rows)", () => {
    expect(parseProblem({ test: "[]" }).test).toEqual({ rows: [] });
  });
});

describe("gradeProblem", () => {
  const problem = parseProblem({
    concept: "left-join",
    test: '[["The Pragmatic Programmer"]]',
  });

  it("passes a matching attempt", () => {
    const { verdict, match } = gradeProblem(problem, okResult([["The Pragmatic Programmer"]]));
    expect(verdict).toEqual({ outcome: "pass" });
    expect(match.ok).toBe(true);
  });

  it("misses a wrong attempt with the comparator's detail", () => {
    const { verdict } = gradeProblem(problem, okResult([["Wrong Book"]]));
    expect(verdict.outcome).toBe("miss");
    expect(verdict.detail).toContain("row 1 differs");
  });

  it("misses an errored attempt, verbatim message stays in the query event", () => {
    const { verdict } = gradeProblem(problem, { kind: "error", message: "no such table: books" });
    expect(verdict).toEqual({
      outcome: "miss",
      detail: "the query failed before producing rows",
    });
  });

  it("passes an expected-error problem when the verbatim message matches", () => {
    // Error-expectation tests come from the fixture side (hidden tests);
    // the declarative attribute carries rows only.
    const errProblem = { concept: "group-by", test: { rows: [], error: "no such column" } };
    const { verdict } = gradeProblem(errProblem, { kind: "error", message: "no such column: regon" });
    expect(verdict.outcome).toBe("pass");
  });
});
