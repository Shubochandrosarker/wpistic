import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import { addWebsiteSchema, connectWebsiteSchema, heartbeatSchema } from '@wpistic/types';
import type { AppContext } from '../../env';
import { ApiError } from '../../errors';
import { requireOrg, requireRole } from '../../middleware/tenant';
import { getClientIp } from '../../middleware/correlation';
import { normalizeDomain } from '../../utils/domain';
import { WebsiteService } from './service';
import { makeLicenseService } from '../licenses/routes';
import { evaluateLicenseLifecycle } from '../licenses/service';

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
  const websiteId = c.req.param('websiteId');
  const service = svc(c);

  const activeActivations = await service.listActiveActivationsForWebsite(websiteId);
  await service.disconnect(orgId, websiteId);

  const licenses = makeLicenseService(c);
  for (const activation of activeActivations) {
    await licenses.deactivateById(activation as never, 'website_disconnected', getClientIp(c), { type: 'user' });
  }
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
    const licenses = makeLicenseService(c);
    const { license, activation } = await licenses.resolveActivationToken(body.activation_token);
    if (activation.status !== 'active' || !evaluateLicenseLifecycle(license).usable) {
      throw ApiError.forbidden('License is not usable right now');
    }
    if (license.product_slug !== body.product) {
      throw ApiError.forbidden('Activation token does not match this product');
    }
    const normalized = normalizeDomain(body.domain);
    if (!normalized || normalized !== activation.domain_normalized) {
      throw ApiError.forbidden('Activation token does not match this domain');
    }
    if (body.environment !== activation.environment) {
      throw ApiError.forbidden('Activation token does not match this environment');
    }
    const result = await svc(c).connect(
      { organization_id: license.organization_id, product_id: license.product_id, max_websites: license.max_websites },
      body
    );
    return c.json(result, 201);
  }
);

export const websiteHeartbeatRoute = new Hono<AppContext>().post(
  '/',
  zValidator('json', heartbeatSchema),
  async (c) => {
    const token = c.req.header('X-Website-Token') ?? '';
    const result = await svc(c).heartbeat(token, c.req.valid('json'));
    return c.json(result);
  }
);
