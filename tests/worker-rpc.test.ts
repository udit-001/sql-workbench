import { describe, expect, it, vi } from "vitest";
import { WorkerRpc, type WorkerEndpoint } from "../src/bench-kit/wasm/worker-rpc";

function mockWorker(): {
  endpoint: WorkerEndpoint;
  sent: unknown[];
  receive(data: unknown): void;
  crash(): void;
} {
  const sent: unknown[] = [];
  let inbound: ((ev: { data: unknown }) => void) | null = null;
  let errorHandler: ((ev: unknown) => void) | null = null;
  const endpoint: WorkerEndpoint = {
    postMessage(msg) {
      sent.push(msg);
    },
    get onmessage() {
      return inbound;
    },
    set onmessage(handler) {
      inbound = handler as never;
    },
    get onerror() {
      return errorHandler;
    },
    set onerror(handler) {
      errorHandler = handler as never;
    },
  };
  return {
    endpoint,
    sent,
    receive(data) {
      inbound?.({ data });
    },
    crash() {
      errorHandler?.({ message: "worker script failed" });
    },
  };
}

describe("WorkerRpc", () => {
  it("posts requests with unique ids and resolves on matching reply", async () => {
    const { endpoint, sent, receive } = mockWorker();
    const rpc = new WorkerRpc(endpoint);

    const pending = rpc.call<{ rows: number[] }>({ op: "run", sql: "SELECT 1" });
    receive({ id: 1, ok: true, result: { rows: [1] } });

    await expect(pending).resolves.toEqual({ rows: [1] });
    expect(sent).toEqual([{ id: 1, op: "run", sql: "SELECT 1" }]);
  });

  it("correlates out-of-order replies to the right caller", async () => {
    const { endpoint, receive } = mockWorker();
    const rpc = new WorkerRpc(endpoint);

    const first = rpc.call<string>({ op: "run", sql: "slow" });
    const second = rpc.call<string>({ op: "run", sql: "fast" });

    receive({ id: 2, ok: true, result: "fast-result" });
    receive({ id: 1, ok: true, result: "slow-result" });

    await expect(first).resolves.toBe("slow-result");
    await expect(second).resolves.toBe("fast-result");
  });

  it("rejects with an Error carrying the worker's failure message", async () => {
    const { endpoint, receive } = mockWorker();
    const rpc = new WorkerRpc(endpoint);

    const pending = rpc.call({ op: "load", statements: ["bogus"] });
    receive({ id: 1, ok: false, error: "sqlite3 init failed" });

    await expect(pending).rejects.toThrow("sqlite3 init failed");
  });

  it("ignores stale or unknown reply ids instead of crashing", async () => {
    const { endpoint, receive } = mockWorker();
    const rpc = new WorkerRpc(endpoint);

    expect(() => {
      receive({ id: 99, ok: true, result: null });
      receive({ noIdAtAll: true });
    }).not.toThrow();
  });

  describe("worker death and timeouts", () => {
    it("a worker error rejects pending calls and future calls fail fast", async () => {
      const { endpoint, receive, crash } = mockWorker();
      const onDead: unknown[] = [];
      const rpc = new WorkerRpc(endpoint, { onDead: (err) => onDead.push(err) });

      const slow = rpc.call({ op: "run", sql: "SELECT 1" });
      crash();

      await expect(slow).rejects.toThrow("worker crashed");
      await expect(rpc.call({ op: "run", sql: "SELECT 2" })).rejects.toThrow("worker crashed");
      expect(onDead).toHaveLength(1); // die once, not per pending call
      receive({ id: 1, ok: true, result: "late" }); // must not resurrect
    });

    it("a deadline blows up every pending call — one stuck query stalls the single worker", async () => {
      vi.useFakeTimers();
      try {
        const { endpoint } = mockWorker();
        const onDead: unknown[] = [];
        const rpc = new WorkerRpc(endpoint, { onDead: (err) => onDead.push(err) });

        const stuck = rpc.call({ op: "run", sql: "RECURSIVE forever" }, { timeoutMs: 5_000 });
        const alsoWaiting = rpc.call({ op: "run", sql: "SELECT 1" }, { timeoutMs: 5_000 });
        vi.advanceTimersByTime(5_000);

        await expect(stuck).rejects.toThrow("worker is stuck");
        await expect(alsoWaiting).rejects.toThrow("worker is stuck");
        expect(onDead).toHaveLength(1);
        await expect(rpc.call({ op: "run", sql: "next" })).rejects.toThrow("worker is stuck");
      } finally {
        vi.useRealTimers();
      }
    });

    it("a reply that lands after the deadline changes nothing", async () => {
      vi.useFakeTimers();
      try {
        const { endpoint, receive } = mockWorker();
        const rpc = new WorkerRpc(endpoint);

        const doomed = rpc.call({ op: "run", sql: "slow" }, { timeoutMs: 1_000 });
        vi.advanceTimersByTime(1_000);
        await expect(doomed).rejects.toThrow("worker is stuck");

        expect(() => receive({ id: 1, ok: true, result: "too late" })).not.toThrow();
      } finally {
        vi.useRealTimers();
      }
    });

    it("calls without a deadline never time out (engine chooses policy)", () => {
      vi.useFakeTimers();
      try {
        const { endpoint } = mockWorker();
        const rpc = new WorkerRpc(endpoint);
        void rpc.call({ op: "run", sql: "long import" });
        vi.advanceTimersByTime(10 * 60_000);
        // No rejection: no deadline was set. The promise stays pending.
      } finally {
        vi.useRealTimers();
      }
    });

    it("dispose rejects pending callers and future calls fail fast", async () => {
      const { endpoint } = mockWorker();
      const rpc = new WorkerRpc(endpoint);

      const inFlight = rpc.call({ op: "run", sql: "SELECT 1" });
      rpc.dispose();

      await expect(inFlight).rejects.toThrow("disposed");
      await expect(rpc.call({ op: "run", sql: "SELECT 2" })).rejects.toThrow("disposed");
    });
  });
});
