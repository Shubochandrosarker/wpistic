import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import { addWebsiteSchema, connectWebsiteSchema, heartbeatSchema } from '@wpistic/types';
import type { AppContext } from '../../env';
import { ApiError } from '../../errors';
import { requireOrg, requireRole } from '../../middleware/tenant';
import { WebsiteService } from './service';
import { LicenseService } from '../licenses/service';

function svc(c: Context<AppContext>): WebsiteService {
  return new WebsiteService(c.get('sql'), c.get('events'));
}

// ---------------------------------------------------------------------------
// /api/v1/organizations/:orgId/websites — dashboard
// ---------------------------------------------------------------------------

export const websiteRoutes = new Hono<AppContext>();

websiteRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  return c.json({ websites: await svc(c).listForOrg(orgId) });
});

websiteRoutes.post('/', zValidator('json', addWebsiteSchema), async (c) => {
  const { orgId } = requireRole(c, ['admin', 'product_manager']);
  const result = await svc(c).addForOrg(orgId, c.req.valid('json'));
  return c.json(result, 201);
});

websiteRoutes.delete('/:websiteId', async (c) => {
  const { orgId } = requireRole(c, ['admin', 'product_manager']);
  await svc(c).disconnect(orgId, c.req.param('websiteId'));
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// Public plugin endpoints: /api/v1/websites/connect + /heartbeat
// ---------------------------------------------------------------------------

const connectBodySchema = connectWebsiteSchema.extend({
  activation_token: z.string().min(10),
});

export const websiteConnectRoute = new Hono<AppContext>().post(
  '/',
  zValidator('json', connectBodySchema),
  async (c) => {
    const body = c.req.valid('json');
    const licenses = new LicenseService(c.get('sql'), c.get('events'), c.env.LICENSE_SIGNING_SECRET, c.env.SESSION_CACHE);
    const { license, activation } = await licenses.resolveActivationToken(body.activation_token);
    if (activation.status !== 'active' || license.status !== 'active') {
      throw ApiError.forbidden('License activation is not active');
    }
    if (license.product_slug !== body.product) {
      throw ApiError.forbidden('Activation token does not match this product');
    }
    const result = await svc(c).connect(license.organization_id, license.product_id, body);
    return c.json(result, 201);
  }
);

export const websiteHeartbeatRoute = new Hono<AppContext>().post(
  '/',
  zValidator('json', heartbeatSchema),
  async (c) => {
    const result = await svc(c).heartbeat(c.req.valid('json'));
    return c.json(result);
  }
);
