/**
 * Organization scope enforcement. Resolves the request's org from the
 * :orgId route param (or X-Organization-Id header), verifies the principal
 * actually belongs to it, and injects orgId/orgRole into context. Membership
 * lookups are cached in KV for 60s.
 *
 * A user-supplied organization id is NEVER trusted without a membership check.
 */
import type { Context, MiddlewareHandler } from 'hono';
import type { AppContext } from '../env';
import { ApiError } from '../errors';
import type { OrgRole } from '@wpistic/types';

async function membershipRole(c: Context<AppContext>, userId: string, orgId: string): Promise<OrgRole | null> {
  const cacheKey = `member:${userId}:${orgId}`;
  const cached = await c.env.SESSION_CACHE.get(cacheKey);
  if (cached) return cached === 'none' ? null : (cached as OrgRole);

  const rows = await c.get('sql')<{ role: OrgRole }[]>`
    SELECT role FROM organization_memberships
    WHERE user_id = ${userId} AND organization_id = ${orgId} AND status = 'active'
    LIMIT 1`;
  const role = rows[0]?.role ?? null;
  await c.env.SESSION_CACHE.put(cacheKey, role ?? 'none', { expirationTtl: 60 });
  return role;
}

export const injectOrgContext: MiddlewareHandler<AppContext> = async (c, next) => {
  if (c.req.method === 'OPTIONS' || !c.get('user')) return next();

  const paramOrgId = c.req.param('orgId');
  const headerOrgId = c.req.header('X-Organization-Id');
  const requested = paramOrgId ?? headerOrgId ?? c.get('tokenOrgId') ?? null;
  if (!requested) return next();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requested)) {
    throw ApiError.badRequest('invalid_org_id', 'Organization id must be a UUID');
  }

  const user = c.get('user')!;

  // API keys are bound to exactly one org — they cannot roam.
  if (c.get('authKind') === 'api_key') {
    if (requested !== c.get('tokenOrgId')) {
      throw ApiError.forbidden('API key does not belong to this organization');
    }
    c.set('orgId', requested);
    c.set('orgRole', 'member');
    return next();
  }

  const role = await membershipRole(c, user.id, requested);
  if (!role) throw ApiError.forbidden('You are not a member of this organization');

  c.set('orgId', requested);
  c.set('orgRole', role);
  await next();
};

/** Guard for org-scoped routes: require a resolved org. */
export function requireOrg(c: Context<AppContext>): { orgId: string; role: OrgRole } {
  const orgId = c.get('orgId');
  const role = c.get('orgRole');
  if (!orgId || !role) throw ApiError.badRequest('org_required', 'Organization context is required');
  return { orgId, role };
}

/** Guard: require one of the given roles (owner always passes). */
export function requireRole(c: Context<AppContext>, roles: readonly OrgRole[]): { orgId: string; role: OrgRole } {
  const ctx = requireOrg(c);
  if (ctx.role !== 'owner' && !roles.includes(ctx.role)) {
    throw ApiError.forbidden(`This action requires one of: ${['owner', ...roles].join(', ')}`);
  }
  // Impersonated admin sessions are read-mostly: billing and destructive
  // actions are blocked at the route level via blockImpersonation().
  return ctx;
}

/** Block sensitive actions during admin impersonation sessions. */
export function blockImpersonation(c: Context<AppContext>): void {
  if (c.get('impersonation')) {
    throw ApiError.forbidden('This action is not allowed during an impersonation session');
  }
}
