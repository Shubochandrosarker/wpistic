/**
 * Session management: HTTP-only cookie sessions on account.wpistic.com,
 * the authenticate middleware, and the session validate/revoke endpoints.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppContext } from '../env';
import { SESSION_COOKIE, SESSION_TTL_HOURS, REFRESH_TOKEN_TTL_DAYS, REFRESH_TOKEN_REMEMBER_DAYS } from '../env';
import { deviceFingerprint, randomToken, sha256Hex } from '../utils/crypto';
import {
  createSession,
  findSessionByTokenHash,
  findUserById,
  listUserOrganizations,
  recordSecurityEvent,
  revokeOtherSessions,
  revokeSession,
  type UserRow,
} from '../db/schema';

export function getClientIp(c: Context<AppContext>): string {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? '0.0.0.0';
}

export interface EstablishedSession {
  sessionId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Create a DB session row, set the session cookie, and return the rotating
 * refresh token (the caller decides whether to expose it — the browser flow
 * does not; the OAuth token endpoint issues its own).
 */
export async function establishSession(
  c: Context<AppContext>,
  user: UserRow,
  organizationId: string | null,
  rememberMe = false
): Promise<EstablishedSession> {
  const sql = c.get('sql');
  const sessionToken = randomToken(32);
  const refreshToken = randomToken(64);
  const refreshDays = rememberMe ? REFRESH_TOKEN_REMEMBER_DAYS : REFRESH_TOKEN_TTL_DAYS;
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  const refreshExpiresAt = new Date(Date.now() + refreshDays * 86400 * 1000);
  const ip = getClientIp(c);
  const userAgent = c.req.header('User-Agent') ?? null;
  const fingerprint = await deviceFingerprint(userAgent ?? '', c.req.header('Accept-Language') ?? '', ip);

  const sessionId = await createSession(sql, {
    userId: user.id,
    organizationId,
    tokenHash: await sha256Hex(sessionToken),
    refreshTokenHash: await sha256Hex(refreshToken),
    expiresAt,
    refreshExpiresAt,
    ipAddress: ip,
    userAgent,
    deviceFingerprint: fingerprint,
  });

  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_HOURS * 3600,
  });

  return { sessionId, refreshToken, refreshExpiresAt };
}

export function clearSessionCookie(c: Context<AppContext>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Resolve the current session from the cookie; sets c.var.session when valid. */
export async function resolveSession(c: Context<AppContext>): Promise<boolean> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return false;
  const session = await findSessionByTokenHash(c.get('sql'), await sha256Hex(token));
  if (!session) return false;
  c.set('session', {
    sessionId: session.id,
    userId: session.user_id,
    organizationId: session.organization_id,
  });
  return true;
}

/** Middleware: require an authenticated browser session. */
export const authenticate: MiddlewareHandler<AppContext> = async (c, next) => {
  if (!(await resolveSession(c))) {
    return c.json({ error: { code: 'unauthenticated', message: 'Sign in required' } }, 401);
  }
  await next();
};

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** GET /session/validate — used by first-party apps to hydrate auth state. */
export async function handleSessionValidate(c: Context<AppContext>) {
  if (!(await resolveSession(c))) return c.json({ valid: false }, 200);
  const sql = c.get('sql');
  const session = c.get('session')!;
  const user = await findUserById(sql, session.userId);
  if (!user || user.status !== 'active') return c.json({ valid: false }, 200);
  const organizations = await listUserOrganizations(sql, user.id);
  const currentOrg = organizations.find((o) => o.id === session.organizationId) ?? organizations[0] ?? null;
  return c.json({
    valid: true,
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      avatar_url: user.avatar_url,
      mfa_enabled: user.mfa_enabled,
      email_verified: user.email_verified_at !== null,
    },
    organizations,
    current_org: currentOrg,
  });
}

/** POST /session/revoke — body: { session_id } or { all_others: true }. */
export async function handleSessionRevoke(c: Context<AppContext>) {
  const sql = c.get('sql');
  const session = c.get('session')!;
  const body = (await c.req.json().catch(() => ({}))) as { session_id?: string; all_others?: boolean };

  if (body.all_others) {
    const revoked = await revokeOtherSessions(sql, session.userId, session.sessionId);
    await recordSecurityEvent(sql, {
      userId: session.userId,
      eventType: 'sessions.revoked_others',
      ipAddress: getClientIp(c),
      metadata: { revoked },
    });
    return c.json({ revoked });
  }

  const target = body.session_id ?? session.sessionId;
  await revokeSession(sql, target, session.userId);
  if (target === session.sessionId) clearSessionCookie(c);
  await recordSecurityEvent(sql, {
    userId: session.userId,
    eventType: 'session.revoked',
    ipAddress: getClientIp(c),
    metadata: { session_id: target },
  });
  return c.json({ revoked: 1 });
}

/** POST /logout */
export async function handleLogout(c: Context<AppContext>) {
  const session = c.get('session')!;
  await revokeSession(c.get('sql'), session.sessionId, session.userId);
  clearSessionCookie(c);
  return c.json({ ok: true });
}

/** GET /sessions — list active sessions for the security page. */
export async function handleListSessions(c: Context<AppContext>) {
  const sql = c.get('sql');
  const session = c.get('session')!;
  const rows = await sql<
    Array<{ id: string; ip_address: string | null; user_agent: string | null; created_at: string }>
  >`
    SELECT id, ip_address::text AS ip_address, user_agent, created_at
    FROM sessions
    WHERE user_id = ${session.userId} AND revoked_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 50`;
  return c.json({
    sessions: rows.map((r) => ({ ...r, current: r.id === session.sessionId })),
  });
}
