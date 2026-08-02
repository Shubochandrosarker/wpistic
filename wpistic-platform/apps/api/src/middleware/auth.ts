/**
 * Authentication: verifies RS256 access tokens issued by account.wpistic.com
 * (local verification against JWT_PUBLIC_KEY — no network hop), or org API
 * keys (`wpk_...`, SHA-256 looked up in api_keys).
 *
 * Plugin-facing endpoints (license lifecycle, website connect/heartbeat,
 * updates, downloads, Stripe webhooks) are public here and enforce their own
 * credentials (license keys / activation tokens / Stripe signatures).
 */
import type { MiddlewareHandler } from 'hono';
import { importSPKI, jwtVerify } from 'jose';
import type { AppContext, Env } from '../env';
import { ApiError } from '../errors';
import { sha256Hex } from '../utils/crypto';
import type { OrgRole } from '@wpistic/types';

let publicKeyPromise: Promise<CryptoKey> | null = null;

function getPublicKey(env: Env): Promise<CryptoKey> {
  publicKeyPromise ??= importSPKI(env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'), 'RS256');
  return publicKeyPromise;
}

const PUBLIC_PATTERNS: RegExp[] = [
  /^\/api\/v1\/licenses\/(activate|validate|deactivate|refresh)$/,
  /^\/api\/v1\/websites\/(connect|heartbeat)$/,
  /^\/api\/v1\/products\/[^/]+\/updates$/,
  /^\/api\/v1\/downloads\/(authorize|file)$/,
  /^\/api\/v1\/webhooks\/stripe$/,
  /^\/api\/v1\/usage\/events$/,
];

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATTERNS.some((p) => p.test(path));
}

/**
 * `X-Admin-Role` is client-supplied (CORS-allowed) and not backed by any
 * staff-permissions table today — nothing branches on it yet, but trusting
 * an arbitrary string verbatim (defaulting to the most-privileged role) is a
 * latent escalation once something does. Constrain it to a known set and
 * default to the least-privileged role instead.
 */
const KNOWN_ADMIN_ROLES = ['super_admin', 'support_agent', 'billing_admin'] as const;
export function resolveAdminRole(headerValue: string | undefined): string {
  return headerValue && (KNOWN_ADMIN_ROLES as readonly string[]).includes(headerValue) ? headerValue : 'support_agent';
}

export const jwtAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  if (c.req.method === 'OPTIONS' || isPublicPath(c.req.path)) return next();

  const authHeader = c.req.header('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) throw ApiError.unauthorized();
  const token = authHeader.slice(7);

  // Admin portal server-side token — only meaningful under /api/v1/admin/*.
  if (c.env.ADMIN_API_TOKEN && token === c.env.ADMIN_API_TOKEN) {
    if (!c.req.path.startsWith('/api/v1/admin')) {
      throw ApiError.forbidden('Admin token is only valid on admin routes');
    }
    c.set('authKind', 'admin_token');
    c.set('adminRole', resolveAdminRole(c.req.header('X-Admin-Role')));
    return next();
  }

  // Organization API keys.
  if (token.startsWith('wpk_')) {
    const sql = c.get('sql');
    const keyHash = await sha256Hex(token);
    const rows = await sql<
      Array<{ id: string; organization_id: string; user_id: string; scopes: string[]; email: string }>
    >`
      SELECT k.id, k.organization_id, k.user_id, k.scopes, u.email
      FROM api_keys k
      JOIN users u ON u.id = k.user_id
      WHERE k.key_hash = ${keyHash}
        AND k.revoked_at IS NULL
        AND (k.expires_at IS NULL OR k.expires_at > NOW())
      LIMIT 1`;
    const apiKey = rows[0];
    if (!apiKey) throw ApiError.unauthorized('API key is invalid or revoked');

    c.set('authKind', 'api_key');
    c.set('user', { id: apiKey.user_id, email: apiKey.email });
    c.set('tokenOrgId', apiKey.organization_id);
    c.set('scopes', (apiKey.scopes as unknown as string[]) ?? []);
    c.executionCtx.waitUntil(
      c
        .get('sql')`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${apiKey.id}`.then(
          () => undefined,
          () => undefined
        )
    );
    return next();
  }

  // Access tokens from account.wpistic.com.
  try {
    const key = await getPublicKey(c.env);
    const { payload } = await jwtVerify(token, key, { issuer: c.env.ACCOUNT_SERVICE_URL });
    c.set('authKind', 'jwt');
    c.set('user', { id: String(payload.sub), email: String(payload.email ?? '') });
    c.set('tokenOrgId', (payload.org_id as string | null) ?? null);
    if (payload.org_role) c.set('orgRole', payload.org_role as OrgRole);
    c.set('scopes', String(payload.scope ?? '').split(/\s+/).filter(Boolean));
    if (typeof payload.sid === 'string') c.set('sessionId', payload.sid);
    c.set('tokenAudience', Array.isArray(payload.aud) ? payload.aud[0] : payload.aud);
    if (payload.imp === true) {
      c.set('impersonation', { admin: String(payload.imp_admin ?? 'unknown') });
    }
  } catch {
    throw ApiError.unauthorized('Access token is invalid or expired');
  }
  await next();
};
