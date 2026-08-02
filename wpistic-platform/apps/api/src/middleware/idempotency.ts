/**
 * Idempotency for unsafe endpoints (license activation, usage events,
 * billing mutations). The client sends X-Idempotency-Key; the first
 * response is cached in KV for 24h and replayed verbatim for retries.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../env';
import { ApiError } from '../errors';
import { getClientIp } from './correlation';

export function idempotency(options: { required?: boolean } = {}): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    if (c.req.method !== 'POST') return next();

    const key = c.req.header('X-Idempotency-Key');
    if (!key) {
      if (options.required) {
        throw ApiError.badRequest('idempotency_key_required', 'X-Idempotency-Key header is required');
      }
      return next();
    }
    if (!/^[A-Za-z0-9_-]{8,255}$/.test(key)) {
      throw ApiError.badRequest('invalid_idempotency_key', 'X-Idempotency-Key must be 8–255 URL-safe characters');
    }

    const scope = c.get('orgId') ?? c.get('tokenOrgId') ?? getClientIp(c);
    const kvKey = `idem:${scope}:${c.req.path}:${key}`;

    const cached = await c.env.RATE_LIMIT.get(kvKey);
    if (cached) {
      const stored = JSON.parse(cached) as { status: number; body: unknown };
      c.header('X-Idempotent-Replay', 'true');
      return c.json(stored.body as never, stored.status as never);
    }

    await next();

    if (c.res.status < 500 && (c.res.headers.get('Content-Type') ?? '').includes('json')) {
      const body = await c.res
        .clone()
        .json()
        .catch(() => null);
      if (body !== null) {
        c.executionCtx.waitUntil(
          c.env.RATE_LIMIT.put(kvKey, JSON.stringify({ status: c.res.status, body }), { expirationTtl: 86400 })
        );
      }
    }
  };
}
