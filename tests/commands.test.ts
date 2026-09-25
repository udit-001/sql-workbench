import { describe, expect, it, vi } from "vitest";
import { createCommandQueue, handleCommand, type CommandContext, type CommandHandle } from "../src/bench-kit/commands";
import { okOutcome } from "../src/bench-kit/fake-engine";
import type { Outcome } from "../src/bench-kit/engine";
import type { Problem } from "../src/bench-kit/problem";
import type { WorkbenchRunOptions } from "../src/app";

function fakeHandle(overrides: Partial<CommandHandle> = {}): { handle: CommandHandle; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    handle: {
      run: vi.fn(async (sql: string, _runOpts?: WorkbenchRunOptions) => {
        calls.push(`run:${sql}`);
        return okOutcome({ columns: ["title"], rows: [["The Pragmatic Programmer"]] });
      }),
      setProblem: vi.fn((p: Problem | null) => {
        calls.push(`setProblem:${p ? "problem" : "null"}`);
      }),
      reset: vi.fn(async () => {
        calls.push("reset");
      }),
      problem: vi.fn(() => null),
      ...overrides,
    } as unknown as CommandHandle,
  };
}

function ctx(handle: CommandHandle, problem: Problem | null = null): CommandContext {
  return { handle, currentProblem: () => problem };
}

const problem: Problem = {
  title: "Books nobody reviewed",
  concept: "left-join",
  test: { rows: [["The Pragmatic Programmer"]] },
};

describe("handleCommand — run", () => {
  it("runs with actor=agent by default and returns the outcome verbatim", async () => {
    const { handle, calls } = fakeHandle();
    const reply = await handleCommand({ id: "1", op: "run", sql: "SELECT title FROM books" }, ctx(handle));

    expect(handle.run).toHaveBeenCalledWith("SELECT title FROM books", { actor: "agent" });
    expect(reply).toMatchObject({ id: "1", ok: true, op: "run", outcome: { kind: "ok", rowCount: 1 } });
    expect(calls).toEqual(["run:SELECT title FROM books"]);
  });

  it("carries an explicit actor", async () => {
    const { handle } = fakeHandle();
    await handleCommand({ id: "1", op: "run", sql: "SELECT 1", actor: "learner" }, ctx(handle));
    expect(handle.run).toHaveBeenCalledWith("SELECT 1", { actor: "learner" });
  });

  it("includes the step verdict when a problem is loaded", async () => {
    const { handle } = fakeHandle();
    const reply = await handleCommand({ id: "1", op: "run", sql: "SELECT title FROM books" }, ctx(handle, problem));
    expect(reply).toMatchObject({ ok: true, verdict: { outcome: "pass" } });
  });

  it("omits the verdict when no problem is loaded", async () => {
    const { handle } = fakeHandle();
    const reply = await handleCommand({ id: "1", op: "run", sql: "SELECT 1" }, ctx(handle));
    expect("verdict" in reply).toBe(false);
  });

  it("returns an ok:false reply for a blank query instead of throwing", async () => {
    const { handle } = fakeHandle();
    // The real handle returns undefined for blank input (no-op rule).
    handle.run = vi.fn(async () => undefined) as CommandHandle["run"];
    const reply = await handleCommand({ id: "1", op: "run", sql: "   " }, ctx(handle));
    expect(reply).toMatchObject({ ok: false, op: "run", error: "blank query — nothing to run" });
  });

  it("infra failures come back as ok:false instead of throwing", async () => {
    const { handle } = fakeHandle();
    handle.run = vi.fn(async () => {
      throw new Error("worker gone");
    }) as CommandHandle["run"];
    const reply = await handleCommand({ id: "1", op: "run", sql: "SELECT 1" }, ctx(handle));
    expect(reply).toMatchObject({ ok: false, op: "run", error: "worker gone" });
  });

  it("an errored engine outcome is ok:true with the verbatim message, graded as miss", async () => {
    const { handle } = fakeHandle({
      run: vi.fn(async () => ({ kind: "error", message: "no such column: regon" })) as CommandHandle["run"],
    });
    const reply = await handleCommand({ id: "1", op: "run", sql: "SELECT regon" }, ctx(handle, problem));
    expect(reply).toMatchObject({
      ok: true,
      outcome: { kind: "error", message: "no such column: regon" },
      verdict: { outcome: "miss" },
    });
  });
});

describe("handleCommand — setProblem / reset", () => {
  it("applies a problem and replies ok", async () => {
    const { handle, calls } = fakeHandle();
    const reply = await handleCommand({ id: "2", op: "setProblem", problem }, ctx(handle));
    expect(calls).toEqual(["setProblem:problem"]);
    expect(reply).toEqual({ id: "2", ok: true, op: "setProblem" });
  });

  it("clears the slot with null and replies ok", async () => {
    const { handle, calls } = fakeHandle();
    const reply = await handleCommand({ id: "2", op: "setProblem", problem: null }, ctx(handle));
    expect(calls).toEqual(["setProblem:null"]);
    expect(reply).toEqual({ id: "2", ok: true, op: "setProblem" });
  });

  it("resets and replies ok", async () => {
    const { handle, calls } = fakeHandle();
    const reply = await handleCommand({ id: "3", op: "reset" }, ctx(handle));
    expect(calls).toEqual(["reset"]);
    expect(reply).toEqual({ id: "3", ok: true, op: "reset" });
  });
});

describe("createCommandQueue", () => {
  it("serializes commands: the second waits for the first to finish", async () => {
    let releaseFirst: (() => void) | undefined;
    const { handle, calls } = fakeHandle();
    handle.run = vi.fn((sql: string) => {
      calls.push(`run:${sql}`);
      if (sql === "slow") {
        return new Promise<Outcome>((resolve) => {
          releaseFirst = () => resolve(okOutcome({ columns: [], rows: [] }));
        });
      }
      return Promise.resolve(okOutcome({ columns: [], rows: [] }));
    }) as CommandHandle["run"];

    const queue = createCommandQueue(ctx(handle));
    const first = queue.send({ id: "a", op: "run", sql: "slow" });
    const second = queue.send({ id: "b", op: "run", sql: "fast" });

    await new Promise((r) => setTimeout(r, 0)); // flush microtasks
    expect(calls).toEqual(["run:slow"]); // second hasn't started yet
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(calls).toEqual(["run:slow", "run:fast"]);
  });

  it("a failed command does not poison the queue", async () => {
    const { handle, calls } = fakeHandle();
    handle.run = vi.fn((sql: string) => {
      if (sql === "boom") return Promise.reject(new Error("worker gone"));
      calls.push(`run:${sql}`);
      return Promise.resolve(okOutcome({ columns: [], rows: [] }));
    }) as CommandHandle["run"];

    const queue = createCommandQueue(ctx(handle));
    const boom = await queue.send({ id: "a", op: "run", sql: "boom" });
    expect(boom).toMatchObject({ id: "a", ok: false, error: "worker gone" });
    const after = await queue.send({ id: "b", op: "run", sql: "next" });
    expect(after).toMatchObject({ id: "b", ok: true });
    expect(calls).toEqual(["run:next"]);
  });
});
