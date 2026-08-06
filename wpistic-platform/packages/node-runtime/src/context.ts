/**
 * `ExecutionContext` for Node.
 *
 * Hono's `app.fetch(request, env, ctx)` passes this through to handlers, and
 * the platform calls `ctx.waitUntil()` for work that should outlive the
 * response — updating `api_keys.last_used_at`, firing an email webhook.
 *
 * On Workers the runtime keeps the isolate alive until those settle. Node has
 * no equivalent, so this tracks them and exposes `drain()`. The server awaits
 * it during shutdown, which is the difference between a clean deploy and
 * silently dropping the last few background writes on every restart.
 *
 * Rejections are swallowed the way Workers swallows them — `waitUntil` work is
 * fire-and-forget by contract, and an unhandled rejection here would take the
 * whole process down.
 */
export interface NodeExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  /**
   * Present so this is structurally assignable to Cloudflare's
   * `ExecutionContext`, which the Hono apps are typed against. Workers uses it
   * to carry values across a service binding; nothing here reads it.
   */
  props: unknown;
}

export interface ExecutionContextTracker extends NodeExecutionContext {
  /** Settle everything currently in flight. Safe to call more than once. */
  drain(timeoutMs?: number): Promise<void>;
  /** How many background tasks are outstanding. */
  pending(): number;
}

export function createExecutionContext(
  onError: (error: unknown) => void = () => undefined
): ExecutionContextTracker {
  const inFlight = new Set<Promise<unknown>>();

  return {
    props: undefined,

    waitUntil(promise) {
      const tracked = Promise.resolve(promise)
        .catch((error: unknown) => {
          onError(error);
        })
        .finally(() => {
          inFlight.delete(tracked);
        });
      inFlight.add(tracked);
    },

    passThroughOnException() {
      // Workers-only concept (fall through to the origin). No origin here.
    },

    pending() {
      return inFlight.size;
    },

    async drain(timeoutMs = 10_000) {
      if (inFlight.size === 0) return;
      // Bounded: one wedged background task must not hold a deploy open
      // forever. Losing it on shutdown is strictly better than never exiting.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      });
      try {
        await Promise.race([Promise.allSettled([...inFlight]).then(() => undefined), deadline]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
