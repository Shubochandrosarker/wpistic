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
import type { AppContext, Env } from './env';
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
import { randomToken } from './utils/crypto';
import { renderLoginPage, renderRegisterPage, renderResetPage } from './ui/pages';

/** Exported for the self-hosted Node entry point — see api/src/index.ts. */
export const app = new Hono<AppContext>();

function allowedOrigins(environment: Env['ENVIRONMENT']): string[] {
  const origins = environment === 'production'
    ? ['https://www.wpistic.com', 'https://account.wpistic.com', 'https://api.wpistic.com', 'https://app.wpistic.com', 'https://admin.wpistic.com']
    : ['https://www-staging.wpistic.com', 'https://account-staging.wpistic.com', 'https://api-staging.wpistic.com', 'https://app-staging.wpistic.com', 'https://admin-staging.wpistic.com'];
  return [...origins, ...(environment === 'staging' ? ['http://localhost:5173', 'http://localhost:4321'] : [])];
}

app.use(
  '*',
  cors({
    origin: (origin, c) => allowedOrigins(c.env.ENVIRONMENT).includes(origin) ? origin : undefined,
    credentials: true,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
    maxAge: 600,
  })
);

/**
 * `default-src 'none'` is the right policy for a JSON identity API, but this
 * Worker also serves the login, register, and reset pages, and those carry an
 * inline <style> and the inline <script> that submits the form over fetch.
 * Applying the API policy to them blocked all three — the stylesheet, the
 * script that calls preventDefault, and (via the form-action fallback) the
 * native submit the browser tries next. The result was a Sign in button that
 * did nothing at all, with no error in the UI to explain it.
 *
 * So the policy is chosen per response type. Pages get a nonce rather than
 * 'unsafe-inline': the markup is generated server-side, the nonce is fresh on
 * every request, and that keeps injected script inert on the one page in the
 * ecosystem where a password is typed.
 */
const API_CSP = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

/**
 * `form-action 'none'` stays on the pages too. The forms have no action or
 * method — they are submitted by fetch — so a native submit would serialize
 * the password into a query string on the current URL. Blocking it is
 * deliberate, and with the script no longer blocked it is unreachable anyway.
 */
function pageCsp(nonce: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'self'",
  ].join('; ');
}

// Security headers on every response.
app.use('*', async (c, next) => {
  const nonce = randomToken(16);
  c.set('cspNonce', nonce);
  await next();
  const isHtml = (c.res.headers.get('Content-Type') ?? '').includes('text/html');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
  c.header('Content-Security-Policy', isHtml ? pageCsp(nonce) : API_CSP);
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});

app.use('*', async (c, next) => {
  const start = Date.now();
  const requestId = c.req.header('X-Correlation-Id') ?? crypto.randomUUID();
  await next();
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: c.res.status >= 500 ? 'error' : 'info',
    service: 'wpistic-account',
    environment: c.env.ENVIRONMENT,
    request_id: requestId,
    correlation_id: requestId,
    route: c.req.path,
    status: c.res.status,
    duration_ms: Date.now() - start,
    error_code: c.res.status >= 400 ? 'http_error' : undefined,
  }));
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
    renderLoginPage({
      client,
      continueUrl: safeContinue(c, c.env.ISSUER, c.env.DEFAULT_REDIRECT),
      mode: 'login',
      nonce: c.get('cspNonce'),
    })
  );
});

app.get('/register', async (c) => {
  const client = await findOAuthClient(c.get('sql'), c.req.query('client') ?? 'wpistic_dashboard');
  return c.html(
    renderRegisterPage({
      client,
      continueUrl: safeContinue(c, c.env.ISSUER, c.env.DEFAULT_REDIRECT),
      mode: 'register',
      nonce: c.get('cspNonce'),
    })
  );
});

app.get('/reset', (c) => c.html(renderResetPage(c.get('cspNonce'), '#C9A961', c.req.query('token') ?? null)));

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
