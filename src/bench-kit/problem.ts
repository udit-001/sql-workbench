/**
 * The Problem object (LEARN-236): one problem = prompt + test (+ optional
 * starter query). The component's entire new interface for graded
 * practice — no problem lists, no progression UI; navigation belongs to
 * the host/agent, which swaps problems via the handle's setProblem().
 *
 * Declarative authoring surface (one element = one problem):
 *
 *   <sql-workbench namespace="lesson-3" dataset="books" mode="card"
 *                  concept="left-join"
 *                  test='[["The Pragmatic Programmer"],["SQL Antipatterns"]]'>
 *     Find every book that has no reviews.
 *   </sql-workbench>
 *
 * Child text is the prompt (plain, readable, degrades gracefully).
 * The `sql` attribute stays the starter query; absent → write from
 * memory. Parsing is a mount-time contract: an unparsable `test`
 * throws with copy naming the attribute — never silent breakage, same
 * rule as the element-id contract between BENCH_TEMPLATE and mount().
 */
import type { Expectation } from "./verify";
import { matchExpectation, type MatchResult } from "./verify";
import type { Outcome } from "./engine";

export interface Problem {
  /** Short title; journals carry it so the agent can name the problem. */
  title?: string;
  /** Free-string grouping tag — host vocabulary never enters the bench. */
  concept?: string;
  /** The task as the learner sees it (element child text). */
  prompt?: string;
  /** Starter query prefilled in the editor; absent = write from scratch. */
  starter?: string;
  /** The ground truth the attempt is graded against. */
  test: Expectation;
}

export interface StepVerdict {
  /** Journal + UI outcome: pass = rows/error matched the test. */
  outcome: "pass" | "miss";
  /** Learner-readable detail for a miss (from the comparator). */
  detail?: string;
}

/**
 * Parse the declarative problem surface. Throws on a malformed `test`
 * attribute — copy names the attribute and shows the parse error, so
 * the fix is mechanical. Everything else is optional: no prompt → the
 * bench behaves as today's plain query runner with a verdict only.
 */
export function parseProblem(input: {
  prompt?: string | null | undefined;
  concept?: string | null | undefined;
  test?: string | null | undefined;
  title?: string | null | undefined;
  starter?: string | null | undefined;
}): Problem {
  const raw = input.test?.trim() ?? "";
  if (!raw) throw new Error(
    'problem: missing required attribute "test" — expected JSON rows like \'[["Ada",2]]\', ' +
    'or a fixture-side test',
  );
  let rows: unknown;
  try {
    rows = JSON.parse(raw);
  } catch (err) {
    throw new Error(`problem: "test" attribute is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Array.isArray(rows)) throw new Error('problem: "test" attribute must be an array of rows');
  if (rows.some((row) => !Array.isArray(row))) {
    throw new Error('problem: "test" attribute rows must be arrays, e.g. \'[["Ada",2]]\'');
  }
  return {
    ...(input.title ? { title: input.title } : {}),
    ...(input.concept ? { concept: input.concept } : {}),
    ...(input.prompt ? { prompt: input.prompt } : {}),
    ...(input.starter ? { starter: input.starter } : {}),
    test: { rows: rows as Expectation["rows"] },
  };
}

/** Grade one attempt: the comparator is the whole judgment. */
export function gradeProblem(problem: Problem, outcome: Outcome): { verdict: StepVerdict; match: MatchResult } {
  const match = matchExpectation(outcome, problem.test);
  return {
    match,
    verdict: match.ok ? { outcome: "pass" } : { outcome: "miss", detail: match.detail },
  };
}
