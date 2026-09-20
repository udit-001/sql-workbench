import { describe, expect, it, vi } from "vitest";
import { createCoalescedQueue } from "../src/bench-kit/coalesced-queue";

describe("createCoalescedQueue", () => {
  it("runs a pushed task immediately when idle", async () => {
    const queue = createCoalescedQueue();
    const task = vi.fn(() => Promise.resolve());
    queue.push(task);
    await queue.settled();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("collapses N pushes during a flight into exactly one rerun", async () => {
    const queue = createCoalescedQueue();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const task = vi.fn(() => gate);
    queue.push(task);
    queue.push(task);
    queue.push(task);
    release();
    await queue.settled();
    // First flight + one trailing rerun — not two.
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("the trailing rerun is the LATEST pushed task", async () => {
    const queue = createCoalescedQueue();
    const ran: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    queue.push(() => gate);
    queue.push(async () => {
      ran.push("stale");
    });
    queue.push(async () => {
      ran.push("fresh");
    });
    release();
    await queue.settled();
    expect(ran).toEqual(["fresh"]);
  });

  it("a rejecting task does not break the queue", async () => {
    const queue = createCoalescedQueue();
    const after = vi.fn(() => Promise.resolve());
    queue.push(() => Promise.reject(new Error("boom")));
    queue.push(after);
    await queue.settled();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("returns to idle: a push after quiescence runs immediately", async () => {
    const queue = createCoalescedQueue();
    const task = vi.fn(() => Promise.resolve());
    queue.push(task);
    await queue.settled();
    queue.push(task);
    await queue.settled();
    expect(task).toHaveBeenCalledTimes(2);
  });
});
