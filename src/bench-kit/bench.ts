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
 * App orchestration: editor submit → engine run → UI render.
 * Deliberately engine-agnostic and DOM-free so FakeEngine-backed unit
 * tests cover it without WASM (LEARN-201 acceptance criteria).
 */
export class Bench {
  constructor(
    private readonly engine: Engine,
    private readonly ui: BenchUi,
  ) {}

  /**
   * Submit the current query. Blank queries are a no-op (returns
   * undefined). Unexpected engine failures (crashed worker etc.) reject —
   * they are infrastructure errors, not learner-visible SQL errors.
   */
  async submit(sql: string): Promise<Outcome | undefined> {
    const query = sql.trim();
    if (!query) return undefined;

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
