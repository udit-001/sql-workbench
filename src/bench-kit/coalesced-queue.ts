/**
 * Serialized task queue with trailing coalescing: one task runs at a time,
 * and pushes that land during a flight collapse into exactly one rerun of
 * the LATEST task once it finishes.
 *
 * Why it exists (SQLWB-3): overlapping schema refreshes could complete out
 * of order and let an older snapshot overwrite a fresher render. Callers
 * push a closure that reads current state at run time, so the single
 * trailing rerun always reflects the latest mutation.
 *
 * Contract: tasks own their errors — handle them inside; the queue only
 * guarantees ordering, never success. A rejecting task does not stall the
 * queue.
 */
export interface CoalescedQueue {
  /** Submit a task. Runs immediately when idle; otherwise it replaces
      whatever was queued during the current flight. */
  push(task: () => Promise<void>): void;
  /** Resolves when nothing is running or queued. */
  settled(): Promise<void>;
}

export function createCoalescedQueue(): CoalescedQueue {
  let running = false;
  let queued: (() => Promise<void>) | null = null;
  let idleWaiters: Array<() => void> = [];

  const settled = (): Promise<void> =>
    !running && !queued ? Promise.resolve() : new Promise((resolve) => idleWaiters.push(resolve));

  const pump = (task: () => Promise<void>): void => {
    running = true;
    void task()
      .catch(() => {
        /* task's own business — see contract */
      })
      .finally(() => {
        running = false;
        if (queued) {
          const next = queued;
          queued = null;
          pump(next);
          return;
        }
        const waiters = idleWaiters;
        idleWaiters = [];
        for (const wake of waiters) wake();
      });
  };

  return {
    push(task: () => Promise<void>): void {
      if (running) {
        queued = task;
        return;
      }
      pump(task);
    },
    settled,
  };
}
