/**
 * Minimal request/reply layer over a Worker: correlates replies to callers
 * by id so concurrent queries can't cross wires, and turns worker-side
 * failures (init crashes, internal errors) into promise rejections.
 *
 * The worker protocol is:
 *   main   → { id, ...request }
 *   worker → { id, ok: true, result } | { id, ok: false, error }
 */

/** Structural subset of Worker the RPC needs; tests substitute a mock. */
export interface WorkerEndpoint {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

export interface RpcReply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export class WorkerRpc {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve(value: unknown): void; reject(reason: Error): void }
  >();

  constructor(private readonly endpoint: WorkerEndpoint) {
    endpoint.onmessage = (event: MessageEvent) => this.receive(event.data as RpcReply);
  }

  call<T>(request: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.endpoint.postMessage({ id, ...request });
    });
  }

  private receive(reply: RpcReply): void {
    if (typeof reply?.id !== "number") return; // stale/foreign message
    const waiter = this.pending.get(reply.id);
    if (!waiter) return;
    this.pending.delete(reply.id);
    if (reply.ok) waiter.resolve(reply.result);
    else waiter.reject(new Error(reply.error ?? "worker failure"));
  }
}
