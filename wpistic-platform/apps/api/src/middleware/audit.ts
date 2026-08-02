/**
 * Audit capture: every successful mutation under /api/v1 writes an
 * audit_logs row (fire-and-forget via waitUntil). Sensitive fields are
 * redacted before the request body is stored as new_values.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../env';
import { getClientIp } from './correlation';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const REDACT_KEYS = /pass(word)?|secret|token|key|authorization|mfa|code_verifier/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

/** Derive "licenses.create" style actions from "POST /api/v1/organizations/:id/licenses". */
function deriveAction(method: string, path: string): { action: string; resourceType: string; resourceId: string | null } {
  const segments = path.replace(/^\/api\/v1\//, '').split('/').filter(Boolean);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let resourceType = 'unknown';
  let resourceId: string | null = null;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]!;
    if (uuidRe.test(seg)) {
      resourceId ??= seg;
    } else {
      resourceType = seg;
      break;
    }
  }
  const verb =
    method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update';
  return { action: `${resourceType}.${verb}`, resourceType, resourceId };
}

export const auditMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  // Read the body up front — it is consumed by handlers otherwise.
  let body: unknown = null;
  if (MUTATING.has(c.req.method) && (c.req.header('Content-Type') ?? '').includes('json')) {
    body = await c.req.raw
      .clone()
      .json()
      .catch(() => null);
  }

  await next();

  if (!MUTATING.has(c.req.method) || c.res.status >= 400) return;
  // Stripe webhooks and plugin endpoints are audited inside their services
  // with richer context.
  if (c.req.path.startsWith('/api/v1/webhooks')) return;

  const user = c.get('user');
  const { action, resourceType, resourceId } = deriveAction(c.req.method, c.req.path);
  const sql = c.get('sql');
  const actorType = c.get('impersonation') || c.get('adminRole') ? 'admin' : 'user';

  c.executionCtx.waitUntil(
    sql`
      INSERT INTO audit_logs (organization_id, user_id, actor_type, action, resource_type, resource_id,
                              new_values, ip_address, user_agent, correlation_id)
      VALUES (${c.get('orgId') ?? c.get('tokenOrgId') ?? null}, ${user?.id ?? null}, ${actorType},
              ${action}, ${resourceType}, ${resourceId},
              ${body ? sql.json(redact(body) as never) : null}, ${getClientIp(c)},
              ${c.req.header('User-Agent') ?? null}, ${c.get('correlationId')})
    `.then(
      () => undefined,
      (err) => console.error(JSON.stringify({ level: 'error', message: 'audit insert failed', error: String(err) }))
    )
  );
};
