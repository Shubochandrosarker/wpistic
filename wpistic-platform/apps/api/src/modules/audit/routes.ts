import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../env';
import { requireRole } from '../../middleware/tenant';

const filterSchema = z.object({
  action: z.string().max(100).optional(),
  user_id: z.string().uuid().optional(),
  correlation_id: z.string().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const auditRoutes = new Hono<AppContext>();

/** GET /api/v1/organizations/:orgId/audit — org-visible audit trail. */
auditRoutes.get('/', async (c) => {
  const { orgId } = requireRole(c, ['admin', 'support_manager']);
  const parsed = filterSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) {
    return c.json({ error: { code: 'invalid_query', message: 'Invalid audit filters' } }, 400);
  }
  const q = parsed.data;

  const logs = await c.get('sql')`
    SELECT a.id, a.actor_type, a.action, a.resource_type, a.resource_id,
           a.new_values, a.correlation_id, a.created_at, u.email AS actor_email
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.organization_id = ${orgId}
      AND (${q.action ?? null}::text IS NULL OR a.action = ${q.action ?? null})
      AND (${q.user_id ?? null}::uuid IS NULL OR a.user_id = ${q.user_id ?? null})
      AND (${q.correlation_id ?? null}::text IS NULL OR a.correlation_id = ${q.correlation_id ?? null})
      AND (${q.from ?? null}::timestamptz IS NULL OR a.created_at >= ${q.from ?? null})
      AND (${q.to ?? null}::timestamptz IS NULL OR a.created_at <= ${q.to ?? null})
    ORDER BY a.created_at DESC
    LIMIT ${q.limit} OFFSET ${q.offset}`;
  return c.json({ logs });
});
