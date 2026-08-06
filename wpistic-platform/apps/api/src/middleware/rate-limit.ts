/**
 * Fixed-window rate limiting:
 *   per IP        100 req/min
 *   per API key   1000 req/min
 *
 * Enforcement order, best first:
 *
 *  1. `RATE_LIMITER` — Cloudflare's native binding. Enforced at the edge before
 *     the request reaches the isolate, so it costs nothing and cannot be raced.
 *  2. `rate_limit_bump()` in Postgres — a single INSERT ... ON CONFLICT DO
 *     UPDATE, which Postgres serializes on the row lock. Correct under
 *     concurrency, and the only option that works on a self-hosted VPS.
 *
 * There is deliberately no in-memory fallback. The previous implementation
 * counted in a module-level Map, which cannot work in production for two
 * reasons: Workers run many isolates across many colos, so the effective limit
 * was `100 x isolate-count`, and the map was never pruned so every distinct
 * client leaked an entry for the life of the isolate. It measured well in
 * staging only because `wrangler dev` is a single isolate — the one case where
 * a per-isolate counter looks global.
 *
 * If neither backend is reachable the limiter fails **closed** on the strict
 * path (login, license activation) and open on general traffic. That asymmetry
 * is deliberate: a database outage should not lock every customer out of the
 * dashboard, but it must not turn credential stuffing into a free-for-all
 * either.
 */
import type { Context, MiddlewareHandler } from 'hono';
import type { AppContext } from '../env';
import { getClientIp } from './correlation';

const IP_LIMIT = 100;
const API_KEY_LIMIT = 1000;

/**
 * Increment `bucket`'s counter for the current window and return the count
 * including this request, or null when no backend could answer.
 */
async function bump(
  c: Context<AppContext>,
  bucket: string,
  windowSeconds: number
): Promise<number | null> {
  // Truncating to the window start is what makes concurrent requests collide
  // on one row — that collision is the mechanism, not a side effect.
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  try {
    const rows = await c.get('sql')<{ count: number }[]>`
      SELECT rate_limit_bump(${bucket}, ${windowStart}, ${windowSeconds * 2}) AS count`;
    return rows[0]?.count ?? null;
  } catch {
    // Surfacing the DB error would turn a limiter hiccup into a 500 on a
    // request that is otherwise fine; the caller decides how to degrade.
    return null;
  }
}

function tooMany(c: Context<AppContext>, retryAfterSeconds: number, message: string) {
  c.header('Retry-After', String(retryAfterSeconds));
  return c.json(
    { error: { code: 'rate_limited', message, correlation_id: c.get('correlationId') } },
    429
  );
}

export const rateLimiter: MiddlewareHandler<AppContext> = async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();

  const authHeader = c.req.header('Authorization') ?? '';
  const isApiKey = authHeader.startsWith('Bearer wpk_');
  // Only a prefix of the key identifies the bucket — enough to distinguish
  // callers, short of putting a usable credential in a database row.
  const subject = isApiKey ? `key:${authHeader.slice(7, 27)}` : `ip:${getClientIp(c)}`;
  const limit = isApiKey ? API_KEY_LIMIT : IP_LIMIT;

  if (c.env.RATE_LIMITER) {
    const verdict = await c.env.RATE_LIMITER.limit({ key: subject });
    c.header('X-RateLimit-Limit', String(limit));
    if (!verdict.success) {
      return tooMany(c, 60, 'Rate limit exceeded — retry after 60 seconds');
    }
    return next();
  }

  const count = await bump(c, `rl:${subject}`, 60);
  c.header('X-RateLimit-Limit', String(limit));
  if (count !== null) {
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
    if (count > limit) {
      return tooMany(c, 60, 'Rate limit exceeded — retry after 60 seconds');
    }
  }
  // count === null: no backend answered. Fail open for general traffic.
  return next();
};

/**
 * Tighter limiter for endpoints where abuse is the point of the endpoint —
 * failed license activations, login attempts. Unlike the general limiter this
 * fails **closed**: if the counter cannot be read, the request is rejected
 * rather than waved through, because these are exactly the paths an attacker
 * would want a degraded backend on.
 */
export function strictLimiter(bucket: string, limit: number, windowSeconds: number): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const count = await bump(c, `rl:${bucket}:${getClientIp(c)}`, windowSeconds);
    if (count === null) {
      return tooMany(c, windowSeconds, 'Too many attempts — try again later');
    }
    if (count > limit) {
      return tooMany(c, windowSeconds, 'Too many attempts — try again later');
    }
    return next();
  };
}
