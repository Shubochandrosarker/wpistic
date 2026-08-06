/**
 * Shared authorization primitives for every admin sub-module.
 *
 * Three layers, applied in this order:
 *
 *  1. `requireAdmin`  — is this principal staff at all? (email in ADMIN_EMAILS
 *     + `admin` scope, or the legacy automation token). Sets `adminRole`.
 *  2. `requireAdminRole(...)` — does that staff role rank high enough for this
 *     class of operation? Roles are configured server-side via ADMIN_ROLES
 *     (`email=role,email=role`); a browser header can never influence them.
 *  3. `requireStepUp` / `requireFreshMfa` — has the operator recently proven
 *     possession of their TOTP device?
 *
 * Step-up vs fresh MFA is the important distinction. Routine management work
 * (editing a plan, renaming an organization, changing a price) runs behind
 * `requireStepUp`: one TOTP entry opens a 15-minute elevated window recorded
 * in KV. Irreversible or high-blast-radius work (revoking a license, deleting
 * a product, suspending an organization, impersonation) always calls
 * `requireFreshMfa` and demands a code for that specific action, regardless of
 * any open window.
 */
import type { Context, MiddlewareHandler } from 'hono';
import type { AppContext, Env } from '../../env';
import { ApiError } from '../../errors';
import { getClientIp } from '../../middleware/correlation';
import { decryptMfaSecret, verifyTotpCode } from '../../utils/totp';

/**
 * Staff roles, least to most privileged. `automation` is deliberately outside
 * the ladder: the legacy CI token is not a person and is only ever allowed
 * where a route opts into it explicitly.
 */
export const ADMIN_ROLES = ['support_agent', 'billing_admin', 'platform_admin', 'super_admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number] | 'automation';

const RANK: Record<string, number> = {
  support_agent: 1,
  billing_admin: 2,
  platform_admin: 3,
  super_admin: 4,
};

/** Elevated-window length. Short enough to matter, long enough to do real work. */
export const STEP_UP_TTL_SECONDS = 15 * 60;

function stepUpKey(userId: string): string {
  return `stepup:${userId}`;
}

/**
 * Staff gate. Applied once at the top of `adminRoutes`, so every sub-router
 * mounted underneath inherits it.
 */
export const requireAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  const kind = c.get('authKind');
  if (kind === 'admin_token' && c.env.ALLOW_LEGACY_ADMIN_TOKEN === 'true') return next();
  if (kind === 'jwt') {
    const email = c.get('user')?.email?.toLowerCase();
    const allowlist = c.env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    const scopes = c.get('scopes') ?? [];
    if (email && allowlist.includes(email) && scopes.includes('admin')) {
      const configuredRole = c.env.ADMIN_ROLES?.split(',')
        .map((pair) => pair.trim().split('=', 2))
        .find(([configuredEmail]) => configuredEmail?.toLowerCase() === email)?.[1];
      c.set('adminRole', configuredRole ?? 'support_agent');
      return next();
    }
  }
  throw ApiError.forbidden('Admin access required');
};

/**
 * Rank gate. Passing any role in `allowed` (or outranking the lowest one)
 * satisfies it. The automation token is rejected here on purpose — management
 * mutations are a human responsibility and must be attributable to a person.
 */
export function requireAdminRole(...allowed: AdminRole[]): MiddlewareHandler<AppContext> {
  const floor = Math.min(...allowed.map((role) => RANK[role] ?? Number.POSITIVE_INFINITY));
  return async (c, next) => {
    const role = c.get('adminRole');
    if (!role || role === 'automation') {
      throw ApiError.forbidden('This operation requires a personal staff session, not the automation token');
    }
    if ((RANK[role] ?? 0) < floor) {
      throw ApiError.forbidden(`This operation requires one of: ${allowed.join(', ')} (you are ${role})`);
    }
    return next();
  };
}

async function loadTotpSecret(c: Context<AppContext>, userId: string): Promise<string> {
  const rows = await c.get('sql')<{ mfa_enabled: boolean; mfa_secret: string | null }[]>`
    SELECT mfa_enabled, mfa_secret FROM users WHERE id = ${userId} LIMIT 1`;
  const user = rows[0];
  if (!user?.mfa_enabled || !user.mfa_secret) throw ApiError.forbidden('Staff MFA must be enabled');
  try {
    return await decryptMfaSecret(user.mfa_secret, c.env.MFA_ENC_KEY);
  } catch {
    throw ApiError.forbidden('Staff MFA configuration is invalid');
  }
}

/**
 * Per-action TOTP. Used for anything irreversible. Never satisfied by an open
 * step-up window — the operator types a code for this specific action.
 */
export async function requireFreshMfa(c: Context<AppContext>, code: string | undefined): Promise<void> {
  const admin = c.get('user');
  if (!admin || !code) throw ApiError.forbidden('Fresh MFA is required for this action');
  const secret = await loadTotpSecret(c, admin.id);
  if (!(await verifyTotpCode(secret, code))) throw ApiError.unauthorized('MFA code is invalid or expired');
}

/** Open a 15-minute elevated window for this operator. */
export async function openStepUp(c: Context<AppContext>, code: string): Promise<{ expires_at: string }> {
  const admin = c.get('user');
  if (!admin) throw ApiError.unauthorized();
  const secret = await loadTotpSecret(c, admin.id);
  if (!(await verifyTotpCode(secret, code))) throw ApiError.unauthorized('MFA code is invalid or expired');

  const expiresAt = new Date(Date.now() + STEP_UP_TTL_SECONDS * 1000);
  await c.env.SESSION_CACHE.put(stepUpKey(admin.id), expiresAt.toISOString(), {
    expirationTtl: STEP_UP_TTL_SECONDS,
  });
  return { expires_at: expiresAt.toISOString() };
}

/** Close the window early (sign-out, or an operator explicitly locking up). */
export async function closeStepUp(c: Context<AppContext>): Promise<void> {
  const admin = c.get('user');
  if (admin) await c.env.SESSION_CACHE.delete(stepUpKey(admin.id));
}

/** Read the window without consuming or extending it. */
export async function stepUpStatus(c: Context<AppContext>): Promise<{ active: boolean; expires_at: string | null }> {
  const admin = c.get('user');
  if (!admin) return { active: false, expires_at: null };
  const raw = await c.env.SESSION_CACHE.get(stepUpKey(admin.id));
  if (!raw) return { active: false, expires_at: null };
  // KV expiry is eventually consistent; re-check the stored deadline so a
  // stale read can never extend the window past its real end.
  if (new Date(raw).getTime() <= Date.now()) return { active: false, expires_at: null };
  return { active: true, expires_at: raw };
}

/**
 * Gate for routine management mutations. The window is *not* refreshed on use
 * — 15 minutes means 15 minutes from the code, not from the last click.
 */
export const requireStepUp: MiddlewareHandler<AppContext> = async (c, next) => {
  const status = await stepUpStatus(c);
  if (!status.active) {
    throw new ApiError(
      403,
      'step_up_required',
      'Unlock admin changes with your authenticator code before making this change'
    );
  }
  return next();
};

/**
 * Every admin mutation writes here. `user_id` is the acting staff member, so
 * the trail answers "who", not just "what".
 */
export async function adminAudit(
  c: Context<AppContext>,
  action: string,
  resourceType: string,
  resourceId: string | null,
  orgId: string | null,
  details: Record<string, unknown>
): Promise<void> {
  const sql = c.get('sql');
  await sql`
    INSERT INTO audit_logs (organization_id, user_id, actor_type, action, resource_type, resource_id,
                            new_values, ip_address, user_agent, correlation_id)
    VALUES (${orgId}, ${c.get('user')?.id ?? null}, 'admin', ${action}, ${resourceType}, ${resourceId},
            ${sql.json(details as never)}, ${getClientIp(c)}, ${c.req.header('User-Agent') ?? null},
            ${c.get('correlationId')})`;
}

/**
 * Audit helper for edits: records the before/after pair so the trail is
 * reversible by hand. Only keys present in `after` are diffed, so a PATCH
 * that touches two columns does not dump the whole row.
 */
export async function adminAuditChange(
  c: Context<AppContext>,
  action: string,
  resourceType: string,
  resourceId: string,
  orgId: string | null,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Promise<void> {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(value)) {
      changed[key] = { from: before[key] ?? null, to: value };
    }
  }
  await adminAudit(c, action, resourceType, resourceId, orgId, { changed });
}

/** Shared shape for reason-bearing destructive bodies. */
export function actorOf(c: Context<AppContext>): { type: 'admin'; id: string | null; email: string | null } {
  const admin = c.get('user');
  return { type: 'admin', id: admin?.id ?? null, email: admin?.email ?? null };
}

export type { Env };
