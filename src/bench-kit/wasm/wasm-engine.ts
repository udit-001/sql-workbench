import type { Engine, Outcome } from "../engine";
import { WorkerRpc, type WorkerEndpoint } from "./worker-rpc";

/** Deadlines for the worker RPC. A runaway query (an unbounded recursive
    CTE, say) never replies and never errors — after the deadline the RPC
    marks itself dead, everything rejects, and the learner gets the
    boot-error panel instead of a silently stuck bench. Generous: large
    imports are legitimate and can run for a while. */
const RUN_TIMEOUT_MS = 120_000;
const LOAD_TIMEOUT_MS = 60_000;

/**
 * Main-thread Engine adapter backed by @sqlite.org/sqlite-wasm running in
 * our dedicated worker (LEARN-193). All SQL crosses the WorkerRpc protocol:
 *   main   → { id, op: "run" | "load", ... }
 *   worker → { id, ok, result | error }
 *
 * The worker ships INLINE (blob) in every build: the single-file contract
 * (LEARN-194) means zero side requests — the wasm rides along as base64.
 */
import InlineWorker from "./sqlite.worker.ts?worker&inline";

export class WasmEngine implements Engine {
  /** Spawns the bundled sqlite worker. */
  static spawn(): WasmEngine {
    return new WasmEngine(new InlineWorker());
  }

  constructor(workerEndpoint: WorkerEndpoint) {
    this.rpc = this.wire(workerEndpoint);
    this.worker = workerEndpoint as Worker;
  }

  private rpc: WorkerRpc;
  private worker: Worker;
  private disposed = false;

  /** Wire a worker endpoint to a fresh RPC. One extraction so spawn and
      respawn share the death wiring exactly — no duplicate listeners. */
  private wire(workerEndpoint: WorkerEndpoint): WorkerRpc {
    return new WorkerRpc(workerEndpoint, {
      // Dead RPC (crash, stuck deadline, dispose): take the worker
      // process down instead of leaving it spinning in the background.
      // Rejections flow to the learner through the app's recovery path.
      onDead: (err) => {
        console.error("[sql-workbench] engine dead:", err.message);
        this.worker.terminate();
      },
    });
  }

  /** True when the current worker is crashed or stuck. The app checks
      this after a rejection to decide between recovery and reporting. */
  get dead(): boolean {
    return this.rpc.isDead;
  }

  /** True after dispose() — recovery must never resurrect a torn-down
      bench's engine. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Replace the crashed/stuck worker with a fresh one. Memory database is
   * gone by definition — the caller re-seeds (engine.load) and replays
   * persisted imports. No-op after dispose: a torn-down bench's engine
   * must not resurrect itself.
   */
  respawn(): void {
    if (this.disposed) return;
    this.worker.terminate();
    this.worker = new InlineWorker();
    this.rpc = this.wire(this.worker);
  }

  run(sql: string): Promise<Outcome> {
    return this.rpc.call<Outcome>({ op: "run", sql }, { timeoutMs: RUN_TIMEOUT_MS });
  }

  /** Stop the worker. The engine is unusable afterwards, and respawn is
      refused — teardown must not resurrect itself. */
  dispose(): void {
    this.disposed = true;
    this.rpc.dispose();
    this.worker.terminate();
  }

  /**
   * Recreate the memory database from seed statements. Used at boot for
   * sample data today; LEARN-202's fixture loader and Reset build on this.
   */
  async load(statements: string[]): Promise<void> {
    await this.rpc.call<void>({ op: "load", statements }, { timeoutMs: LOAD_TIMEOUT_MS });
  }
}
