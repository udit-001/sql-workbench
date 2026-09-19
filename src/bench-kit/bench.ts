import type { Engine, Outcome } from "./engine";

/**
 * DOM-free port the Bench orchestrator drives. The real implementation
 * renders into the page; tests substitute an in-memory recorder.
 */
export interface BenchUi {
  /** Toggled around each run so the surface can show busy state. */
  setRunning(running: boolean): void;
  /** Receives exactly one outcome per completed run. */
  showOutcome(outcome: Outcome): void;
}

/**
 * Conservative "could this SQL change data?" classifier for UI state
 * hygiene: a Reset after only read-only runs restores nothing, so it
 * must not churn the engine or journal a dataset-reset event.
 *
 * Multi-statement strings are classified by their FIRST statement, and
 * the result is treated as "dirty" on ANY mutation attempt — even an
 * errored one — because SQLite's exec applies earlier statements of a
 * script before failing on a later one. The safe direction is false
 * negatives on writes (Reset still works), never false positives on
 * reads (Reset wrongly skipped).
 */
const READ_ONLY_LEAD_KEYWORDS = new Set(["select", "with", "explain", "values"]);

export function mutatesData(sql: string): boolean {
  let i = 0;
  const n = sql.length;
  // Skip leading whitespace and comments so "-- try this\nDELETE …"
  // classifies by its real first keyword.
  for (;;) {
    while (i < n && /\s/.test(sql.charAt(i))) i++;
    if (sql.startsWith("--", i)) {
      while (i < n && sql.charAt(i) !== "\n") i++;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    break;
  }
  const word = /^[a-zA-Z]+/.exec(sql.slice(i))?.[0]?.toLowerCase() ?? "";
  if (!word) return false; // blank → nothing to mutate
  return !READ_ONLY_LEAD_KEYWORDS.has(word);
}

/**
 * App orchestration: editor submit → engine run → UI render.
 * Deliberately engine-agnostic and DOM-free so FakeEngine-backed unit
 * tests cover it without WASM (LEARN-201 acceptance criteria).
 */
export class Bench {
  constructor(
    private readonly engine: Engine,
    private readonly ui: BenchUi,
  ) {}

  /** True when a run since the last seed MAY have changed data. Set on
      any mutation attempt through submit() — even an errored one, since
      exec applies earlier statements of a script before failing — and
      cleared by markSeeded(). Reset consults this so a no-op restore
      doesn't churn the engine or journal a meaningless history entry. */
  get dirtySinceSeed(): boolean {
    return this.dirty;
  }

  /** Record that the database was just re-seeded (engine.load). */
  markSeeded(): void {
    this.dirty = false;
  }

  private dirty = false;

  /**
   * Submit the current query. Blank queries are a no-op (returns
   * undefined). Unexpected engine failures (crashed worker etc.) reject —
   * they are infrastructure errors, not learner-visible SQL errors.
   */
  async submit(sql: string): Promise<Outcome | undefined> {
    const query = sql.trim();
    if (!query) return undefined;

    // Any mutation attempt dirties the data, outcome aside: a failed
    // multi-statement script may still have applied its early statements.
    if (mutatesData(query)) this.dirty = true;

    this.ui.setRunning(true);
    try {
      const outcome = await this.engine.run(query);
      this.ui.showOutcome(outcome);
      return outcome;
    } finally {
      this.ui.setRunning(false);
    }
  }
}
