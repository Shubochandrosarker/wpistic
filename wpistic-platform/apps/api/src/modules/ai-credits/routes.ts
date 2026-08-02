import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import { usageEventSchema } from '@wpistic/types';
import type { AppContext } from '../../env';
import { ApiError } from '../../errors';
import { requireOrg } from '../../middleware/tenant';
import { idempotency } from '../../middleware/idempotency';
import { CreditService } from './service';
import { makeLicenseService } from '../licenses/routes';

function svc(c: Context<AppContext>): CreditService {
  return new CreditService(c.get('sql'), c.get('events'));
}

// ---------------------------------------------------------------------------
// /api/v1/organizations/:orgId/ai-credits
// ---------------------------------------------------------------------------

export const aiCreditRoutes = new Hono<AppContext>();

aiCreditRoutes.get('/balance', async (c) => {
  const { orgId } = requireOrg(c);
  return c.json(await svc(c).balance(orgId));
});

aiCreditRoutes.get('/ledger', async (c) => {
  const { orgId } = requireOrg(c);
  const limit = parseInt(c.req.query('limit') ?? '50', 10) || 50;
  return c.json({ entries: await svc(c).ledger(orgId, limit) });
});

// ---------------------------------------------------------------------------
// POST /api/v1/usage/events — metered consumption from product apps/plugins.
// Auth: user JWT / org API key (org from context) or a license activation
// token in the body for WordPress plugins.
// ---------------------------------------------------------------------------

const usageBodySchema = usageEventSchema.extend({
  activation_token: z.string().min(10).optional(),
});

export const usageEventRoutes = new Hono<AppContext>().post(
  '/',
  idempotency(),
  zValidator('json', usageBodySchema),
  async (c) => {
    const body = c.req.valid('json');

    // Resolve the paying organization from the strongest available credential.
    let orgId = c.get('orgId') ?? c.get('tokenOrgId') ?? null;
    if (!orgId && body.activation_token) {
      const licenses = makeLicenseService(c);
      const { license, activation } = await licenses.resolveActivationToken(body.activation_token);
      if (activation.status !== 'active') throw ApiError.forbidden('Activation is not active');
      orgId = license.organization_id;
    }
    if (!orgId) throw ApiError.unauthorized('Provide a bearer token or activation_token');
    if (body.organization_id && body.organization_id !== orgId) {
      throw ApiError.forbidden('organization_id does not match your credentials');
    }

    const result = await svc(c).consume({
      organizationId: orgId,
      productSlug: body.product,
      operation: body.operation,
      units: body.units,
      idempotencyKey: body.idempotency_key,
      metadata: body.metadata,
    });
    return c.json({ accepted: true, duplicate: result.duplicate, balance: result.balance });
  }
);
