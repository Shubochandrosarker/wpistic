import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { requireOrg } from '../../middleware/tenant';
import { EntitlementService } from './service';

export const entitlementRoutes = new Hono<AppContext>();

/** GET /api/v1/organizations/:orgId/entitlements?product=slug */
entitlementRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  const service = new EntitlementService(c.get('sql'), c.env.SESSION_CACHE);
  const resolution = await service.resolveForOrg(orgId, c.req.query('product') || undefined);
  return c.json(resolution);
});
