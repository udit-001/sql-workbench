import type { Engine, Outcome } from "../engine";
import { WorkerRpc, type WorkerEndpoint } from "./worker-rpc";

/**
 * Main-thread Engine adapter backed by @sqlite.org/sqlite-wasm running in
 * our dedicated worker (LEARN-193). All SQL crosses the WorkerRpc protocol:
 *   main   → { id, op: "run" | "load", ... }
 *   worker → { id, ok, result | error }
 */
export class WasmEngine implements Engine {
  /** Spawns the bundled sqlite worker. */
  static spawn(): WasmEngine {
    return new WasmEngine(
      new Worker(new URL("./sqlite.worker.ts", import.meta.url), {
        type: "module",
      }),
    );
  }

  constructor(workerEndpoint: WorkerEndpoint) {
    this.rpc = new WorkerRpc(workerEndpoint);
  }

  private readonly rpc: WorkerRpc;

  run(sql: string): Promise<Outcome> {
    return this.rpc.call<Outcome>({ op: "run", sql });
  }

  /**
   * Recreate the memory database from seed statements. Used at boot for
   * sample data today; LEARN-202's fixture loader and Reset build on this.
   */
  async load(statements: string[]): Promise<void> {
    await this.rpc.call<void>({ op: "load", statements });
  }
}
