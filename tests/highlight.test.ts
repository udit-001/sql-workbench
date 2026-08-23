import { describe, expect, it } from "vitest";
import { highlightSql, type SqlToken } from "../src/bench-kit/highlight";

/** Tokens joined must always equal the input — the overlay's alignment contract. */
function kinds(sql: string): string[] {
  return highlightSql(sql).map((t) => t.kind);
}

describe("highlightSql", () => {
  it("classifies keywords case-insensitively", () => {
    expect(kinds("select")).toEqual(["keyword"]);
    expect(kinds("SELECT")).toEqual(["keyword"]);
    expect(kinds("Group By")).toEqual(["keyword", "whitespace", "keyword"]);
  });

  it("highlights a full query", () => {
    const tokens = highlightSql("SELECT c.region FROM orders o\nWHERE o.total_amount > 10.5;");
    expect(kinds("SELECT c.region FROM orders o\nWHERE o.total_amount > 10.5;")).toEqual([
      "keyword", "whitespace", "word", "punctuation", "word",
      "whitespace", "keyword", "whitespace", "word", "whitespace", "word",
      "newline", "keyword", "whitespace", "word", "punctuation", "word",
      "whitespace", "operator", "whitespace", "number", "punctuation",
    ]);
    expect(tokens.map((t) => t.text).join("")).toBe(
      "SELECT c.region FROM orders o\nWHERE o.total_amount > 10.5;",
    );
  });

  it("keeps strings verbatim including doubled quotes", () => {
    const tokens = highlightSql("'O''Brien'");
    expect(tokens).toEqual([{ kind: "string", text: "'O''Brien'" }]);
  });

  it("does not treat keywords inside strings as keywords", () => {
    const tokens = highlightSql("SELECT 'from where';");
    expect(kinds("SELECT 'from where';")).toEqual([
      "keyword", "whitespace", "string", "punctuation",
    ]);
  });

  it("handles -- line comments to end of line", () => {
    const tokens = highlightSql("SELECT 1 -- from here\nFROM t");
    const comment = tokens.find((t) => t.kind === "comment");
    expect(comment?.text).toBe("-- from here");
    expect(tokens.map((t) => t.text).join("")).toBe("SELECT 1 -- from here\nFROM t");
  });

  it("handles /* block comments */ spanning newlines", () => {
    const tokens = highlightSql("/* a\nb */SELECT 1");
    expect(kinds("/* a\nb */SELECT 1")).toEqual(["comment", "keyword", "whitespace", "number"]);
  });

  it("treats numbers with decimals and negatives' digits as numbers", () => {
    expect(kinds("1")).toEqual(["number"]);
    expect(kinds("12.5")).toEqual(["number"]);
    expect(kinds(".5")).toEqual(["number"]);
  });

  it("never emits empty tokens (overlay would drift)", () => {
    for (const sql of ["", " ", "''", "--x", "a''b"]) {
      for (const token of highlightSql(sql)) {
        expect(token.text.length).toBeGreaterThan(0);
      }
    }
  });

  it("preserves every character of arbitrary input (alignment property)", () => {
    for (const sql of [
      "WITH RECURSIVE cnt(x) AS (VALUES(1)) SELECT * FROM cnt;",
      "INSERT INTO t(a) VALUES('semi;colon');",
      "a''b'c'",
      "\n\n\n",
      "/* unterminated",
      "'unterminated",
    ]) {
      expect(highlightSql(sql).map((t) => t.text).join("")).toBe(sql);
    }
  });
});
