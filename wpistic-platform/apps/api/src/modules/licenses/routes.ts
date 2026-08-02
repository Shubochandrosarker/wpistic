import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import {
  activateLicenseSchema,
  deactivateLicenseSchema,
  refreshLicenseSchema,
  validateLicenseSchema,
} from '@wpistic/types';
import type { AppContext } from '../../env';
import { blockImpersonation, requireOrg, requireRole } from '../../middleware/tenant';
import { strictLimiter } from '../../middleware/rate-limit';
import { idempotency } from '../../middleware/idempotency';
import { getClientIp } from '../../middleware/correlation';
import { LicenseService, type ActivationRow } from './service';

export function makeLicenseService(c: Context<AppContext>): LicenseService {
  return new LicenseService(
    c.get('sql'),
    {
      signingSecret: c.env.LICENSE_SIGNING_SECRET,
      jwtPrivateKey: c.env.LICENSE_JWT_PRIVATE_KEY,
      jwtPublicKey: c.env.LICENSE_JWT_PUBLIC_KEY,
    },
    c.env.SESSION_CACHE
  );
}

// ---------------------------------------------------------------------------
// Public plugin SDK endpoints (key / activation-token authenticated)
// ---------------------------------------------------------------------------

export const licenseActivateRoute = new Hono<AppContext>().post(
  '/',
  strictLimiter('license-activate', 5, 3600), // 5 failed attempts per hour per IP
  idempotency(),
  zValidator('json', activateLicenseSchema),
  async (c) => {
    const result = await makeLicenseService(c).activate(c.req.valid('json'), getClientIp(c), c.req.header('User-Agent') ?? null);
    return c.json(result);
  }
);

export const licenseValidateRoute = new Hono<AppContext>().post(
  '/',
  zValidator('json', validateLicenseSchema),
  async (c) => {
    const result = await makeLicenseService(c).validate(c.req.valid('json'));
    return c.json(result);
  }
);

export const licenseDeactivateRoute = new Hono<AppContext>().post(
  '/',
  zValidator('json', deactivateLicenseSchema),
  async (c) => {
    const body = c.req.valid('json');
    await makeLicenseService(c).deactivate(body.activation_token, body.installation_uuid, getClientIp(c));
    return c.json({ deactivated: true });
  }
);

export const licenseRefreshRoute = new Hono<AppContext>().post(
  '/',
  zValidator('json', refreshLicenseSchema),
  async (c) => {
    const result = await makeLicenseService(c).refresh(c.req.valid('json').activation_token);
    return c.json(result);
  }
);

// ---------------------------------------------------------------------------
// Org-scoped dashboard routes: /api/v1/organizations/:orgId/licenses
// ---------------------------------------------------------------------------

export const licenseRoutes = new Hono<AppContext>();

licenseRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  const licenses = await makeLicenseService(c).listForOrg(orgId);
  return c.json({ licenses });
});

licenseRoutes.get('/:licenseId', async (c) => {
  const { orgId } = requireOrg(c);
  const result = await makeLicenseService(c).getWithActivations(orgId, c.req.param('licenseId'));
  return c.json(result);
});

/** Rotate the key — returns the new raw key exactly once. */
licenseRoutes.post('/:licenseId/rotate', async (c) => {
  const { orgId } = requireRole(c, ['admin', 'product_manager']);
  blockImpersonation(c);
  const user = c.get('user');
  const service = makeLicenseService(c);
  const { rawKey, mask } = await service.rotate(orgId, c.req.param('licenseId'), {
    type: 'user',
    id: user?.id ?? null,
    email: user?.email ?? null,
  });
  const { license, activations } = await service.getWithActivations(orgId, c.req.param('licenseId'));
  return c.json({ license, activations, key: rawKey, key_mask: mask });
});

/** Deactivate a single site from the dashboard. */
licenseRoutes.delete('/:licenseId/activations/:activationId', async (c) => {
  const { orgId } = requireRole(c, ['admin', 'product_manager']);
  blockImpersonation(c);
  const user = c.get('user');
  const sql = c.get('sql');
  const rows = await sql`
    SELECT a.id, a.license_id, a.organization_id, a.website_id, a.domain_normalized,
           a.installation_uuid, a.environment, a.status, a.token_hash
    FROM license_activations a
    JOIN licenses l ON l.id = a.license_id
    WHERE a.id = ${c.req.param('activationId')} AND a.license_id = ${c.req.param('licenseId')}
      AND l.organization_id = ${orgId}
    LIMIT 1`;
  const activation = rows[0];
  if (!activation) {
    return c.json({ error: { code: 'not_found', message: 'Activation not found' } }, 404);
  }
  await makeLicenseService(c).deactivateById(activation as unknown as ActivationRow, 'dashboard', getClientIp(c), {
    type: 'user',
    id: user?.id ?? null,
    email: user?.email ?? null,
  });
  return c.body(null, 204);
});
