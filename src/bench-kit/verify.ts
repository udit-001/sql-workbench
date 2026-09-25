/**
 * Expectation comparator (LEARN-236): grades a query Outcome against a
 * problem's declared test — the single ground truth behind in-bench
 * problem verdicts, author pre-flight checks, and future headless
 * verification. Pure logic, node-testable; no DOM, no engine.
 *
 * Contract notes:
 * - The learner is graded on their RESULT, never their query text:
 *   any correct query passes (standard practice-arena behavior).
 * - Row comparison is normalized (values → canonical strings) so
 *   460.0 vs 460 and INTEGER/REAL reportings don't fail a correct answer.
 * - `order: false` (default) sorts both sides before comparing; set
 *   `order: true` only when the problem's point is ordering (ORDER BY).
 * - Engine errors are part of the verbatim contract: when the test
 *   declares `error`, a matching verbatim message PASSES — the mistake
 *   is the lesson.
 */
import type { Outcome, QueryOutcome, SqlValue } from "./engine";

export interface Expectation {
  /** Expected result rows, aligned to the actual column order. */
  rows: SqlValue[][];
  /** Optional column-name check; omit to ignore names and order. */
  columns?: string[];
  /** Row order must match exactly (default false). */
  order?: boolean;
  /** When set, the test PASSES on a verbatim engine error that contains
      this text (case-sensitive, substring match). */
  error?: string;
}

export type MatchResult =
  | { ok: true }
  | {
      ok: false;
      /** Why the attempt missed: "error" (wrong failure), "columns",
          "count", "rows". `detail` is learner-readable, single line. */
      kind: "error" | "columns" | "count" | "rows";
      detail: string;
    };

export function matchExpectation(outcome: Outcome, expect: Expectation): MatchResult {
  if (expect.error !== undefined) {
    if (outcome.kind === "error" && outcome.message.includes(expect.error)) return { ok: true };
    return {
      ok: false,
      kind: "error",
      detail: outcome.kind === "error"
        ? "failed with a different error than this problem tests for"
        : "the problem expects a query failure — this run succeeded",
    };
  }

  if (outcome.kind === "error") {
    return { ok: false, kind: "rows", detail: "the query failed before producing rows" };
  }
  return matchRows(outcome, expect);
}

function matchRows(outcome: QueryOutcome, expect: Expectation): MatchResult {
  if (expect.columns && !columnsEqual(outcome.columns, expect.columns)) {
    return {
      ok: false,
      kind: "columns",
      detail: `result columns are [${outcome.columns.join(", ")}], expected [${expect.columns.join(", ")}]`,
    };
  }

  // A truncated outcome can't be fully verified past the cap — count is
  // checked first (quoting the TRUE rowCount) so the learner sees why,
  // not a misleading row diff.
  if (outcome.truncated && outcome.rowCount !== expect.rows.length) {
    return {
      ok: false,
      kind: "count",
      detail: `query returned ${outcome.rowCount} rows, expected ${expect.rows.length}`,
    };
  }

  const actualRows = normalizeRows(outcome.rows);
  const expectedRows = normalizeRows(expect.rows);

  if (actualRows.length !== expectedRows.length) {
    return {
      ok: false,
      kind: "count",
      detail: `query returned ${actualRows.length} rows, expected ${expectedRows.length}`,
    };
  }

  const left = expect.order ? actualRows : sortRows(actualRows);
  const right = expect.order ? expectedRows : sortRows(expectedRows);

  for (let i = 0; i < left.length; i++) {
    const got = left[i];
    const want = right[i];
    if (!got || !want || !rowEquals(got, want)) {
      return {
        ok: false,
        kind: "rows",
        detail: `row ${i + 1} differs — expected (${want?.join(", ") ?? ""}), got (${got?.join(", ") ?? ""})`,
      };
    }
  }
  return { ok: true };
}

/** Canonical cell string: NULL → "" ; blobs → readable placeholder;
    everything else through String() so numeric shapes compare equal. */
function canonical(value: SqlValue): string {
  if (value === null) return "";
  if (value instanceof Uint8Array) return `[blob ${value.byteLength}]`;
  return String(value);
}

function normalizeRows(rows: SqlValue[][]): string[][] {
  return rows.map((row) => row.map(canonical));
}

function rowEquals(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function columnsEqual(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((c, i) => c === expected[i]);
}

function sortRows(rows: string[][]): string[][] {
  return [...rows].sort((a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const cmp = (a[i] ?? "").localeCompare(b[i] ?? "");
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}
