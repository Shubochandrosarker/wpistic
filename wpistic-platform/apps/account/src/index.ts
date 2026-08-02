/**
 * account.wpistic.com — OAuth 2.1 / OIDC-compatible identity service.
 * Hono on Cloudflare Workers, PostgreSQL via Hyperdrive, KV for PKCE.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  loginSchema,
  mfaVerifySchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
} from '@wpistic/types';
import type { AppContext } from './env';
import { ACCESS_TOKEN_TTL_SECONDS } from './env';
import { createDb } from './db/client';
import { findOAuthClient, findUserById, listUserOrganizations } from './db/schema';
import { handleRegister } from './auth/register';
import { handleLogin } from './auth/login';
import { handleAuthorize } from './auth/authorize';
import { handleTokenExchange } from './auth/token';
import { handleMfaDisable, handleMfaSetup, handleMfaVerify } from './auth/mfa';
import { handlePasswordResetConfirm, handlePasswordResetRequest } from './auth/reset';
import {
  authenticate,
  handleListSessions,
  handleLogout,
  handleSessionRevoke,
  handleSessionValidate,
} from './auth/sessions';
import { getJwks, verifyAccessToken } from './auth/tokens';
import { renderLoginPage, renderRegisterPage, renderResetPage } from './ui/pages';

const app = new Hono<AppContext>();

const ALLOWED_ORIGINS = [
  'https://app.wpistic.com',
  'https://admin.wpistic.com',
  'https://app.chatbotistic.com',
  'https://app.insightistic.com',
  'https://app.tripistic.com',
  'https://app.wpagentistic.com',
  'http://localhost:5173',
  'http://localhost:4321',
];

app.use(
  '*',
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : undefined),
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Security headers on every response.
app.use('*', async (c, next) => {
  await next();
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});

// Per-request DB client, closed after the response is streamed.
app.use('*', async (c, next) => {
  const sql = createDb(c.env);
  c.set('sql', sql);
  try {
    await next();
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
});

app.onError((err, c) => {
  console.error(JSON.stringify({ level: 'error', message: err.message, stack: err.stack, path: c.req.path }));
  return c.json({ error: { code: 'internal_error', message: 'Something went wrong' } }, 500);
});

// ---------------------------------------------------------------------------
// HTML pages (branded per ?client=...)
// ---------------------------------------------------------------------------

/** Keep `continue` on-origin (authorize URLs) or fall back to the dashboard. */
function safeContinue(c: { req: { query: (k: string) => string | undefined } }, issuer: string, fallback: string) {
  const raw = c.req.query('continue');
  if (!raw) return fallback;
  try {
    const url = new URL(raw, issuer);
    return url.origin === new URL(issuer).origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

app.get('/', (c) => c.redirect(c.env.DEFAULT_REDIRECT, 302));

app.get('/login', async (c) => {
  const client = await findOAuthClient(c.get('sql'), c.req.query('client') ?? 'wpistic_dashboard');
  return c.html(
    renderLoginPage({ client, continueUrl: safeContinue(c, c.env.ISSUER, c.env.DEFAULT_REDIRECT), mode: 'login' })
  );
});

app.get('/register', async (c) => {
  const client = await findOAuthClient(c.get('sql'), c.req.query('client') ?? 'wpistic_dashboard');
  return c.html(
    renderRegisterPage({ client, continueUrl: safeContinue(c, c.env.ISSUER, c.env.DEFAULT_REDIRECT), mode: 'register' })
  );
});

app.get('/reset', (c) => c.html(renderResetPage('#C9A961', c.req.query('token') ?? null)));

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

app.post('/register', zValidator('json', registerSchema), (c) => handleRegister(c, c.req.valid('json')));
app.post('/login', zValidator('json', loginSchema), (c) => handleLogin(c, c.req.valid('json')));
app.post('/logout', authenticate, handleLogout);

// OAuth endpoints
app.get('/authorize', handleAuthorize);
app.post('/authorize', handleAuthorize);
app.post('/token', handleTokenExchange);

app.get('/userinfo', async (c) => {
  const auth = c.req.header('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return c.json({ error: { code: 'unauthenticated', message: 'Bearer token required' } }, 401);
  }
  try {
    const claims = await verifyAccessToken(c.env, auth.slice(7));
    const user = await findUserById(c.get('sql'), String(claims.sub));
    if (!user) return c.json({ error: { code: 'not_found', message: 'User not found' } }, 404);
    return c.json({
      sub: user.id,
      email: user.email,
      email_verified: user.email_verified_at !== null,
      given_name: user.first_name,
      family_name: user.last_name,
      picture: user.avatar_url,
      org_id: claims.org_id ?? null,
    });
  } catch {
    return c.json({ error: { code: 'invalid_token', message: 'Access token is invalid or expired' } }, 401);
  }
});

// MFA
app.post('/mfa/setup', authenticate, handleMfaSetup);
app.post('/mfa/verify', authenticate, zValidator('json', mfaVerifySchema), (c) =>
  handleMfaVerify(c, c.req.valid('json'))
);
app.post(
  '/mfa/disable',
  authenticate,
  zValidator('json', z.object({ password: z.string().min(1), code: z.string().min(6).max(10) })),
  (c) => handleMfaDisable(c, c.req.valid('json'))
);

// Password reset
app.post('/password-reset/request', zValidator('json', passwordResetRequestSchema), (c) =>
  handlePasswordResetRequest(c, c.req.valid('json'))
);
app.post('/password-reset/confirm', zValidator('json', passwordResetConfirmSchema), (c) =>
  handlePasswordResetConfirm(c, c.req.valid('json'))
);

// Sessions
app.get('/session/validate', handleSessionValidate);
app.post('/session/revoke', authenticate, handleSessionRevoke);
app.get('/sessions', authenticate, handleListSessions);

// Current user's organizations (used by first-party UIs post-login).
app.get('/organizations', authenticate, async (c) => {
  const session = c.get('session')!;
  const organizations = await listUserOrganizations(c.get('sql'), session.userId);
  return c.json({ organizations, current_org_id: session.organizationId });
});

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

app.get('/.well-known/openid-configuration', (c) =>
  c.json({
    issuer: c.env.ISSUER,
    authorization_endpoint: `${c.env.ISSUER}/authorize`,
    token_endpoint: `${c.env.ISSUER}/token`,
    userinfo_endpoint: `${c.env.ISSUER}/userinfo`,
    jwks_uri: `${c.env.ISSUER}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'profile', 'email', 'org', 'admin'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    id_token_signing_alg_values_supported: ['RS256'],
    access_token_ttl_seconds: ACCESS_TOKEN_TTL_SECONDS,
  })
);

app.get('/.well-known/jwks.json', async (c) => c.json(await getJwks(c.env)));

app.get('/health', (c) => c.json({ ok: true, service: 'wpistic-account' }));

export default app;
