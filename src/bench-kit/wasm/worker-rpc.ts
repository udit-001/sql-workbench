/**
 * Minimal request/reply layer over a Worker: correlates replies to callers
 * by id so concurrent queries can't cross wires, turns worker-side
 * failures (init crashes, internal errors) into promise rejections, and —
 * because the worker is single-threaded — treats ANY missed reply as the
 * whole engine being stuck: a deadline, a worker error event, or a
 * dispose marks the RPC dead, fails every pending caller, and fails
 * future calls fast instead of leaving them hanging.
 *
 * The worker protocol is:
 *   main   → { id, ...request }
 *   worker → { id, ok: true, result } | { id, ok: false, error }
 */

/** Structural subset of Worker the RPC needs; tests substitute a mock. */
export interface WorkerEndpoint {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
  /** Fires when the worker crashes or fails to load. */
  onerror?: ((event: ErrorEvent) => void) | null;
}

export interface RpcReply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Why the RPC went dead. Discriminated by `instanceof` so a caller can
 * tell an infrastructure death apart from anything else that might reject
 * through the same promise — including after another caller already
 * recovered the engine (the current dead-flag alone can't say that).
 * The message carries the specific flavor: crash, stuck deadline, or
 * dispose.
 */
export class WorkerRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerRpcError";
  }
}

interface PendingCall {
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timer?: ReturnType<typeof setTimeout>;
}

export class WorkerRpc {
  private nextId = 1;
  private readonly pending = new Map<number, PendingCall>();
  private dead: WorkerRpcError | null = null;

  /** True once the worker errored, a deadline blew, or dispose ran.
      Callers use it to decide between reporting and recovering. */
  get isDead(): boolean {
    return this.dead !== null;
  }

  constructor(
    private readonly endpoint: WorkerEndpoint,
    private readonly opts: { onDead?: (err: WorkerRpcError) => void } = {},
  ) {
    endpoint.onmessage = (event: MessageEvent) => this.receive(event.data as RpcReply);
    endpoint.onerror = () =>
      this.markDead(new WorkerRpcError("worker crashed or failed to load"));
  }

  call<T>(request: Record<string, unknown>, opts: { timeoutMs?: number } = {}): Promise<T> {
    // Fail fast after death — no point queueing behind a stuck worker.
    if (this.dead) return Promise.reject(this.dead);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const entry: PendingCall = { resolve: resolve as (value: unknown) => void, reject };
      if (opts.timeoutMs && opts.timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          this.markDead(
            new WorkerRpcError(
              `no reply from the worker within ${opts.timeoutMs}ms — the worker is stuck`,
            ),
          );
        }, opts.timeoutMs);
      }
      this.pending.set(id, entry);
      this.endpoint.postMessage({ id, ...request });
    });
  }

  /** Fail every pending and future caller — for engine teardown. */
  dispose(): void {
    this.markDead(new WorkerRpcError("the engine was disposed"));
  }

  private receive(reply: RpcReply): void {
    if (typeof reply?.id !== "number") return; // stale/foreign message
    const waiter = this.pending.get(reply.id);
    if (!waiter) return; // late reply after a deadline — nothing left to wake
    this.pending.delete(reply.id);
    if (waiter.timer) clearTimeout(waiter.timer);
    if (reply.ok) waiter.resolve(reply.result);
    else waiter.reject(new Error(reply.error ?? "worker failure"));
  }

  /**
   * A dead RPC is a one-way door: every pending caller is rejected and
   * every future call fails fast. onDead lets the owner take the worker
   * down (terminate) instead of leaving it spinning.
   */
  private markDead(err: WorkerRpcError): void {
    if (this.dead) return;
    this.dead = err;
    for (const waiter of this.pending.values()) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(err);
    }
    this.pending.clear();
    this.opts.onDead?.(err);
  }
}
