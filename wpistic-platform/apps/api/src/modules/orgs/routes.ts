import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { SignJWT, importPKCS8 } from 'jose';
import { createOrganizationSchema, switchOrgSchema, updateOrganizationSchema } from '@wpistic/types';
import type { AppContext, Env } from '../../env';
import { ApiError } from '../../errors';
import { blockImpersonation, requireOrg, requireRole } from '../../middleware/tenant';
import { OrgService } from './service';

function svc(c: Context<AppContext>): OrgService {
  return new OrgService(c.get('sql'), c.get('events'));
}

// ---------------------------------------------------------------------------
// /api/v1/organizations
// ---------------------------------------------------------------------------

export const orgRoutes = new Hono<AppContext>();

orgRoutes.get('/', async (c) => {
  const user = c.get('user');
  if (!user) throw ApiError.unauthorized();
  const organizations = await c.get('sql')`
    SELECT o.id, o.name, o.slug, o.avatar_url, o.billing_email, o.status, m.role, o.created_at
    FROM organization_memberships m
    JOIN organizations o ON o.id = m.organization_id
    WHERE m.user_id = ${user.id} AND m.status = 'active' AND o.status = 'active'
    ORDER BY m.created_at ASC`;
  return c.json({ organizations });
});

orgRoutes.post('/', zValidator('json', createOrganizationSchema), async (c) => {
  const user = c.get('user');
  if (!user) throw ApiError.unauthorized();
  const body = c.req.valid('json');
  const organization = await svc(c).create(user.id, body.name, body.slug, body.billing_email);
  return c.json({ organization }, 201);
});

orgRoutes.get('/:orgId', async (c) => {
  requireOrg(c);
  return c.json({ organization: await svc(c).get(c.get('orgId')!) });
});

orgRoutes.patch('/:orgId', zValidator('json', updateOrganizationSchema), async (c) => {
  const { orgId } = requireRole(c, ['admin', 'billing_manager']);
  blockImpersonation(c);
  return c.json({ organization: await svc(c).update(orgId, c.req.valid('json')) });
});

// ---------------------------------------------------------------------------
// /api/v1/auth — org switching
// ---------------------------------------------------------------------------

let signingKeyPromise: Promise<CryptoKey> | null = null;
function getSigningKey(env: Env): Promise<CryptoKey> {
  signingKeyPromise ??= importPKCS8(env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
  return signingKeyPromise;
}

export const authRoutes = new Hono<AppContext>();

/**
 * POST /api/v1/auth/switch-org — verify membership in the target org and
 * re-sign the access token with the new org_id/org_role claims. The refresh
 * token (owned by account.wpistic.com) is untouched.
 */
authRoutes.post('/switch-org', zValidator('json', switchOrgSchema), async (c) => {
  const user = c.get('user');
  if (!user || c.get('authKind') !== 'jwt') throw ApiError.unauthorized();
  // Impersonation sessions are scoped to exactly the org they were issued for
  // (enforced in injectOrgContext) — switching context away from it here would
  // mint an unrestricted token for a different org under the same admin login.
  blockImpersonation(c);
  const { organization_id: targetOrgId } = c.req.valid('json');

  const rows = await c.get('sql')<{ role: string }[]>`
    SELECT role FROM organization_memberships
    WHERE user_id = ${user.id} AND organization_id = ${targetOrgId} AND status = 'active'
    LIMIT 1`;
  const role = rows[0]?.role;
  if (!role) throw ApiError.forbidden('You are not a member of that organization');

  // Membership cache may hold a stale value for this pair — refresh it.
  await c.env.SESSION_CACHE.put(`member:${user.id}:${targetOrgId}`, role, { expirationTtl: 60 });

  const key = await getSigningKey(c.env);
  const accessToken = await new SignJWT({
    email: user.email,
    org_id: targetOrgId,
    org_role: role,
    scope: (c.get('scopes') ?? []).join(' '),
    ...(c.get('sessionId') ? { sid: c.get('sessionId') } : {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'wpistic-1' })
    .setSubject(user.id)
    .setAudience(c.get('tokenAudience') ?? 'wpistic_dashboard')
    .setIssuer(c.env.ACCOUNT_SERVICE_URL)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);

  return c.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 900 });
});
