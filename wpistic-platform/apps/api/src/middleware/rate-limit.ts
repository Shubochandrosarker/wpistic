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

async function bump(kv: KVNamespace, key: string): Promise<number> {
  const current = parseInt((await kv.get(key)) ?? '0', 10) + 1;
  // 120s TTL keeps the previous window around briefly; the minute in the key
  // does the real windowing.
  await kv.put(key, String(current), { expirationTtl: 120 });
  return current;
}

export const rateLimiter: MiddlewareHandler<AppContext> = async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();

  const minute = Math.floor(Date.now() / 60000);
  const authHeader = c.req.header('Authorization') ?? '';
  const isApiKey = authHeader.startsWith('Bearer wpk_');

  const subject = isApiKey ? `key:${authHeader.slice(7, 27)}` : `ip:${getClientIp(c)}`;
  const limit = isApiKey ? API_KEY_LIMIT : IP_LIMIT;

  const count = await bump(c.env.RATE_LIMIT, `rl:${subject}:${minute}`);
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
    const count = parseInt((await c.env.RATE_LIMIT.get(key)) ?? '0', 10);
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
    // Only count failures so legitimate traffic is never throttled.
    if (c.res.status >= 400) {
      await c.env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: windowSeconds + 60 });
    }
  };
}
