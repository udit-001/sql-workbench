import type { Engine, Outcome, QueryOutcome } from "./engine";

export type FakeHandler = (sql: string) => Outcome | Promise<Outcome>;

/**
 * Test double for the Engine seam. All app logic is driven through
 * FakeEngine in unit tests — no WASM is ever loaded (LEARN-200 testing
 * decisions). The handler maps each submitted SQL to a canned Outcome.
 */
export class FakeEngine implements Engine {
  readonly calls: string[] = [];

  constructor(private readonly handler: FakeHandler) {}

  run(sql: string): Promise<Outcome> {
    this.calls.push(sql);
    return Promise.resolve(this.handler(sql));
  }
}

export function okOutcome(parts: {
  columns: string[];
  rows: QueryOutcome["rows"];
  ms?: number;
  rowCount?: number;
  truncated?: boolean;
}): QueryOutcome {
  return {
    kind: "ok",
    columns: parts.columns,
    rows: parts.rows,
    rowCount: parts.rowCount ?? parts.rows.length,
    truncated: parts.truncated ?? false,
    ms: parts.ms ?? 0,
  };
}

export function errorOutcome(message: string): Outcome {
  return { kind: "error", message };
}
