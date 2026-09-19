import type { Engine, Outcome } from "../engine";
import { WorkerRpc, type WorkerEndpoint } from "./worker-rpc";

/**
 * Main-thread Engine adapter backed by @sqlite.org/sqlite-wasm running in
 * our dedicated worker (LEARN-193). All SQL crosses the WorkerRpc protocol:
 *   main   → { id, op: "run" | "load", ... }
 *   worker → { id, ok, result | error }
 *
 * Two adapters at the distribution seam (LEARN-194): the standalone build
 * spawns a URL worker (cacheable separate chunk); the single-file component
 * build needs the worker inlined as a blob (`?worker&inline`, spike-proven).
 */
import InlineWorker from "./sqlite.worker.ts?worker&inline";

export class WasmEngine implements Engine {
  /** Spawns the bundled sqlite worker. */
  static spawn(opts: { inline?: boolean } = {}): WasmEngine {
    const worker = opts.inline
      ? new InlineWorker()
      : new Worker(new URL("./sqlite.worker.ts", import.meta.url), {
          type: "module",
        });
    return new WasmEngine(worker);
  }

  constructor(workerEndpoint: WorkerEndpoint) {
    this.rpc = new WorkerRpc(workerEndpoint);
    this.worker = workerEndpoint as Worker;
  }

  private readonly rpc: WorkerRpc;
  private readonly worker: Worker;

  run(sql: string): Promise<Outcome> {
    return this.rpc.call<Outcome>({ op: "run", sql });
  }

  /** Stop the worker. The engine is unusable afterwards. */
  dispose(): void {
    this.worker.terminate();
  }

  /**
   * Recreate the memory database from seed statements. Used at boot for
   * sample data today; LEARN-202's fixture loader and Reset build on this.
   */
  async load(statements: string[]): Promise<void> {
    await this.rpc.call<void>({ op: "load", statements });
  }
}
