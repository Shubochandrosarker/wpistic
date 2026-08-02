/**
 * OAuth token endpoint. Grants:
 *
 * authorization_code — verify code hash (unused, unexpired), verify PKCE
 *   S256 against the KV-stored challenge, then issue:
 *   - access token: RS256 JWT, 15 min, aud=client_id, org_id claim
 *   - refresh token: opaque 64-byte random, SHA-256 stored, 30 days
 *   - id token: RS256 JWT with user claims
 *
 * refresh_token — rotate the refresh token, issue a fresh access token.
 */
import type { Context } from 'hono';
import type { AppContext } from '../env';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS, SESSION_TTL_HOURS } from '../env';
import { randomToken, sha256Hex, verifyPassword } from '../utils/crypto';
import { pkceKvKey, verifyPkce } from '../utils/pkce';
import {
  createSession,
  findOAuthClient,
  findSessionByRefreshHash,
  findUserById,
  isMemberOfOrg,
  rotateRefreshToken,
} from '../db/schema';
import { signAccessToken, signIdToken } from './tokens';
import { getClientIp } from './sessions';

async function readBody(c: Context<AppContext>): Promise<Record<string, string>> {
  const contentType = c.req.header('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    return (await c.req.json().catch(() => ({}))) as Record<string, string>;
  }
  const form = await c.req.parseBody();
  return Object.fromEntries(Object.entries(form).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
}

function oauthError(c: Context<AppContext>, error: string, description: string, status: 400 | 401 = 400) {
  return c.json({ error, error_description: description }, status);
}

export async function handleTokenExchange(c: Context<AppContext>) {
  const sql = c.get('sql');
  const body = await readBody(c);
  const grantType = body.grant_type;

  const client = await findOAuthClient(sql, body.client_id ?? '');
  if (!client) return oauthError(c, 'invalid_client', 'Unknown client_id', 401);

  // Confidential clients must present their secret; public clients rely on PKCE.
  if (client.is_confidential) {
    const secret = body.client_secret ?? '';
    if (!client.client_secret_hash || !secret || !(await verifyPassword(secret, client.client_secret_hash))) {
      return oauthError(c, 'invalid_client', 'Client authentication failed', 401);
    }
  }

  if (grantType === 'authorization_code') {
    const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = body;
    if (!code || !redirectUri || !codeVerifier) {
      return oauthError(c, 'invalid_request', 'code, redirect_uri and code_verifier are required');
    }

    const codeHash = await sha256Hex(code);
    const rows = await sql<
      Array<{
        id: string;
        user_id: string;
        client_id: string;
        organization_id: string | null;
        redirect_uri: string;
        scope: string | null;
        expires_at: string;
        used_at: string | null;
      }>
    >`SELECT id, user_id, client_id, organization_id, redirect_uri, scope, expires_at, used_at
      FROM authorization_codes WHERE code_hash = ${codeHash} LIMIT 1`;
    const authCode = rows[0];

    if (!authCode || authCode.used_at || new Date(authCode.expires_at) < new Date()) {
      return oauthError(c, 'invalid_grant', 'Authorization code is invalid or expired');
    }
    if (authCode.client_id !== client.client_id || authCode.redirect_uri !== redirectUri) {
      return oauthError(c, 'invalid_grant', 'Authorization code does not match this client');
    }

    const pkceRaw = await c.env.PKCE_STORAGE.get(pkceKvKey(codeHash));
    if (!pkceRaw) return oauthError(c, 'invalid_grant', 'PKCE challenge expired — restart the login flow');
    const pkce = JSON.parse(pkceRaw) as { challenge: string; method: string };
    if (!(await verifyPkce(pkce.challenge, pkce.method, codeVerifier))) {
      return oauthError(c, 'invalid_grant', 'PKCE verification failed');
    }

    // Single use: burn code + challenge before issuing tokens.
    await sql`UPDATE authorization_codes SET used_at = NOW() WHERE id = ${authCode.id}`;
    await c.env.PKCE_STORAGE.delete(pkceKvKey(codeHash));

    const user = await findUserById(sql, authCode.user_id);
    if (!user || user.status !== 'active') return oauthError(c, 'invalid_grant', 'User is not active');

    const orgRole = authCode.organization_id ? await isMemberOfOrg(sql, user.id, authCode.organization_id) : null;

    // OAuth token-endpoint session: carries the rotating refresh token.
    const refreshToken = randomToken(64);
    const sessionId = await createSession(sql, {
      userId: user.id,
      organizationId: authCode.organization_id,
      tokenHash: await sha256Hex(randomToken(32)), // not cookie-addressable
      refreshTokenHash: await sha256Hex(refreshToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400 * 1000),
      ipAddress: getClientIp(c),
      userAgent: c.req.header('User-Agent') ?? null,
      deviceFingerprint: null,
    });

    const scope = authCode.scope ?? 'openid profile email org';
    const accessToken = await signAccessToken(c.env, {
      userId: user.id,
      email: user.email,
      orgId: authCode.organization_id,
      orgRole,
      clientId: client.client_id,
      scope,
      sessionId,
    });
    const idToken = scope.includes('openid')
      ? await signIdToken(c.env, {
          userId: user.id,
          email: user.email,
          emailVerified: user.email_verified_at !== null,
          firstName: user.first_name,
          lastName: user.last_name,
          clientId: client.client_id,
        })
      : undefined;

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      ...(idToken ? { id_token: idToken } : {}),
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  if (grantType === 'refresh_token') {
    const provided = body.refresh_token;
    if (!provided) return oauthError(c, 'invalid_request', 'refresh_token is required');

    const session = await findSessionByRefreshHash(sql, await sha256Hex(provided));
    if (!session) return oauthError(c, 'invalid_grant', 'Refresh token is invalid or expired');

    const user = await findUserById(sql, session.user_id);
    if (!user || user.status !== 'active') return oauthError(c, 'invalid_grant', 'User is not active');

    // Rotation: old token stops working the moment the new one is issued.
    const newRefresh = randomToken(64);
    await rotateRefreshToken(
      sql,
      session.id,
      await sha256Hex(newRefresh),
      new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400 * 1000),
      new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000)
    );

    const orgRole = session.organization_id ? await isMemberOfOrg(sql, user.id, session.organization_id) : null;
    const accessToken = await signAccessToken(c.env, {
      userId: user.id,
      email: user.email,
      orgId: session.organization_id,
      orgRole,
      clientId: client.client_id,
      scope: 'openid profile email org',
      sessionId: session.id,
    });

    return c.json({
      access_token: accessToken,
      refresh_token: newRefresh,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  return oauthError(c, 'unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
}
