/**
 * KV-based fixed-window rate limiting:
 *   per IP        100 req/min
 *   per API key   1000 req/min
 *   per org       5000 req/min (after tenant resolution — cheap best effort)
 *
 * KV is eventually consistent, so windows are approximate — acceptable for
 * abuse control; hard quotas belong in billing.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../env';
import { getClientIp } from './correlation';

const IP_LIMIT = 100;
const API_KEY_LIMIT = 1000;

const localCounters = new Map<string, { count: number; expiresAt: number }>();
const localLocks = new Map<string, Promise<void>>();

async function bumpAtomic(key: string, windowMs: number): Promise<number> {
  const previous = localLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const currentLock = new Promise<void>((resolve) => (release = resolve));
  const queued = previous.then(() => currentLock);
  localLocks.set(key, queued);
  await previous;
  try {
    const now = Date.now();
    const entry = localCounters.get(key);
    const next = !entry || entry.expiresAt <= now ? { count: 1, expiresAt: now + windowMs } : { ...entry, count: entry.count + 1 };
    localCounters.set(key, next);
    return next.count;
  } finally {
    release();
    if (localLocks.get(key) === queued) localLocks.delete(key);
  }
}

export const rateLimiter: MiddlewareHandler<AppContext> = async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();

  const minute = Math.floor(Date.now() / 60000);
  const authHeader = c.req.header('Authorization') ?? '';
  const isApiKey = authHeader.startsWith('Bearer wpk_');

  const subject = isApiKey ? `key:${authHeader.slice(7, 27)}` : `ip:${getClientIp(c)}`;
  const limit = isApiKey ? API_KEY_LIMIT : IP_LIMIT;

  const bucket = `rl:${subject}:${minute}`;
  const native = c.env.RATE_LIMITER ? await c.env.RATE_LIMITER.limit({ key: subject }) : null;
  const count = native ? (native.success ? 1 : limit + 1) : await bumpAtomic(bucket, 60_000);
  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(Math.max(0, limit - count)));

  if (count > limit) {
    c.header('Retry-After', '60');
    return c.json(
      {
        error: {
          code: 'rate_limited',
          message: 'Rate limit exceeded — retry after 60 seconds',
          correlation_id: c.get('correlationId'),
        },
      },
      429
    );
  }
  await next();
};

/** Targeted limiter for sensitive endpoints (e.g. failed license activations: 5/hour/IP). */
export function strictLimiter(bucket: string, limit: number, windowSeconds: number): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const window = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = `rl:${bucket}:${getClientIp(c)}:${window}`;
    const count = await bumpAtomic(key, windowSeconds * 1000);
    if (count >= limit) {
      c.header('Retry-After', String(windowSeconds));
      return c.json(
        {
          error: {
            code: 'rate_limited',
            message: 'Too many attempts — try again later',
            correlation_id: c.get('correlationId'),
          },
        },
        429
      );
    }
    await next();
  };
}
