/**
 * Command seam for the relay glue (LEARN-236): the transport-free half
 * of the agent → bench channel. The relay's live connection (tab ↔
 * Pharos server) is the transport; a thin adapter binds it to
 * `handleCommand` and never knows what a command means.
 *
 *   transport receives  { id, op: "run" | "setProblem" | "reset", ... }
 *   transport sends     { id, ok: true, ...reply } | { id, ok: false, error }
 *
 * Deep-module rules the handler enforces:
 * - Commands serialize behind a queue: an agent command never
 *   interrupts the human's in-flight run — the human wins their turn.
 * - The verify state-hygiene protocol (reset → run → reset) is COMPOSED
 *   by the caller as three commands; the handler executes exactly what
 *   arrives and journals everything.
 * - `run` commands default to actor "agent" — this seam exists for the
 *   agent; a learner run goes through the editor/handle directly.
 * - Replies carry the full Outcome verbatim (verbatim contract) plus
 *   the step verdict when a problem is set, so the agent's exec call
 *   gets PASS/FAIL without reading the journal.
 */
import type { Outcome } from "./engine";
import type { Problem, StepVerdict } from "./problem";
import { gradeProblem } from "./problem";
import type { WorkbenchHandle } from "../app";
import type { WorkbenchRunOptions } from "../app";

/** Minimal handle surface the handler needs — a structural subset of
 *  WorkbenchHandle, so page glue can pass the real handle directly. */
export interface CommandHandle {
  run(sql: string, runOpts?: WorkbenchRunOptions): Promise<Outcome | undefined>;
  setProblem(problem: Problem | null): void;
  reset(): Promise<void>;
  problem(): Problem | null;
}

export type BenchCommand =
  | { id: string; op: "run"; sql: string; actor?: "learner" | "agent" }
  | { id: string; op: "setProblem"; problem: Problem | null }
  | { id: string; op: "reset" };

export type CommandReply =
  | {
      id: string;
      ok: true;
      op: "run";
      /** Verbatim engine outcome (rows or the raw error message). */
      outcome: Outcome;
      /** Present when a problem slot is loaded: the graded verdict. */
      verdict?: StepVerdict;
    }
  | { id: string; ok: true; op: "setProblem" | "reset" }
  | { id: string; ok: false; op: BenchCommand["op"]; error: string };

export interface CommandContext {
  handle: CommandHandle;
  /** The mount handle carries the loaded problem; the reply's verdict
      comes from re-grading against it (pure, deterministic). */
  currentProblem: () => Problem | null;
}

/**
 * Execute one command and produce its reply. Never throws: failures —
 * unknown op, infra errors — come back as ok:false replies with the
 * error verbatim. Transport retries dedupe on `id` upstream (the
 * journal's own idempotency); the handler itself is at-least-once.
 */
export async function handleCommand(cmd: BenchCommand, ctx: CommandContext): Promise<CommandReply> {
  switch (cmd.op) {
    case "run": {
      try {
        const actor = cmd.actor ?? "agent"; // the command seam serves the agent
        const outcome = await ctx.handle.run(cmd.sql, { actor });
        if (!outcome) return { id: cmd.id, ok: false, op: "run", error: "blank query — nothing to run" };
        const problem = ctx.currentProblem();
        const verdict = problem ? gradeProblem(problem, outcome).verdict : undefined;
        return { id: cmd.id, ok: true, op: "run", outcome, ...(verdict ? { verdict } : {}) };
      } catch (err) {
        return { id: cmd.id, ok: false, op: "run", error: err instanceof Error ? err.message : String(err) };
      }
    }
    case "setProblem": {
      try {
        ctx.handle.setProblem(cmd.problem);
        return { id: cmd.id, ok: true, op: "setProblem" };
      } catch (err) {
        return { id: cmd.id, ok: false, op: "setProblem", error: err instanceof Error ? err.message : String(err) };
      }
    }
    case "reset": {
      try {
        await ctx.handle.reset();
        return { id: cmd.id, ok: true, op: "reset" };
      } catch (err) {
        return { id: cmd.id, ok: false, op: "reset", error: err instanceof Error ? err.message : String(err) };
      }
    }
    default: {
      const op = (cmd as { op?: string }).op ?? "";
      return { id: (cmd as { id?: string }).id ?? "", ok: false, op: "run", error: `unknown command op "${op}"` };
    }
  }
}

/**
 * Serialized command queue: commands never interleave, and the human's
 * in-flight run (already inside handle.run) is never preempted — a
 * command waits for its turn. The returned sender is what the transport
 * adapter binds to the relay connection.
 */
export function createCommandQueue(ctx: CommandContext): {
  send: (cmd: BenchCommand) => Promise<CommandReply>;
} {
  let chain: Promise<unknown> = Promise.resolve();
  return {
    send(cmd: BenchCommand): Promise<CommandReply> {
      const turn = chain.then(() => handleCommand(cmd, ctx));
      // A failed turn must not poison the queue for the next command.
      chain = turn.catch(() => undefined);
      return turn;
    },
  };
}
