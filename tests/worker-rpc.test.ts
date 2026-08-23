import { describe, expect, it } from "vitest";
import { WorkerRpc, type WorkerEndpoint } from "../src/bench-kit/wasm/worker-rpc";

function mockWorker(): {
  endpoint: WorkerEndpoint;
  sent: unknown[];
  receive(data: unknown): void;
} {
  const sent: unknown[] = [];
  let inbound: ((ev: { data: unknown }) => void) | null = null;
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
  };
  return {
    endpoint,
    sent,
    receive(data) {
      inbound?.({ data });
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
});
