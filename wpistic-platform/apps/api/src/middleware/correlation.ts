/**
 * Correlation IDs + structured request logging. Every request gets an
 * X-Correlation-Id (propagated when the caller sends one) that flows into
 * audit logs, domain events, and log lines.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../env';

export const correlationId: MiddlewareHandler<AppContext> = async (c, next) => {
  const incoming = c.req.header('X-Correlation-Id');
  const id = incoming && /^[A-Za-z0-9_-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
  c.set('correlationId', id);
  await next();
  c.header('X-Correlation-Id', id);
};

export const requestLogger: MiddlewareHandler<AppContext> = async (c, next) => {
  const start = Date.now();
  await next();
  const line = {
    timestamp: new Date().toISOString(),
    level: c.res.status >= 500 ? 'error' : 'info',
    service: 'wpistic-api',
    environment: c.env.ENVIRONMENT,
    request_id: c.get('correlationId'),
    correlation_id: c.get('correlationId'),
    route: c.req.path,
    status: c.res.status,
    duration_ms: Date.now() - start,
    error_code: c.res.status >= 400 ? 'http_error' : undefined,
    org_id: c.get('orgId') ?? c.get('tokenOrgId') ?? undefined,
    user_id: c.get('user')?.id,
    worker_version: c.req.header('CF-Worker'),
    ray: c.req.header('CF-Ray'),
  };
  console.log(JSON.stringify(line));
};

export function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? '0.0.0.0';
}
