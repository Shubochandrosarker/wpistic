/**
 * OAuth 2.1 authorization endpoint.
 *
 * GET/POST /authorize?response_type=code&client_id=...&redirect_uri=...
 *   &scope=...&state=...&code_challenge=...&code_challenge_method=S256
 *
 * - client_id validated against oauth_clients; redirect_uri must match exactly
 * - PKCE S256 required for all clients (OAuth 2.1)
 * - Authenticated session → mint a 32-byte code (SHA-256 stored),
 *   stash the PKCE challenge in KV (5 min TTL), redirect with code+state
 * - No session → render the branded login page with the authorize URL as
 *   the continue target
 */
import type { Context } from 'hono';
import type { AppContext } from '../env';
import { AUTH_CODE_TTL_SECONDS } from '../env';
import { randomToken, sha256Hex } from '../utils/crypto';
import { pkceKvKey } from '../utils/pkce';
import { findOAuthClient, findUserById, listUserOrganizations } from '../db/schema';
import { resolveSession } from './sessions';
import { renderLoginPage } from '../ui/pages';

interface AuthorizeParams {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
}

function readParams(c: Context<AppContext>): AuthorizeParams {
  const q = (name: string) => c.req.query(name) ?? '';
  return {
    response_type: q('response_type'),
    client_id: q('client_id'),
    redirect_uri: q('redirect_uri'),
    scope: q('scope') || 'openid profile email org',
    state: q('state'),
    code_challenge: q('code_challenge'),
    code_challenge_method: q('code_challenge_method'),
  };
}

export async function handleAuthorize(c: Context<AppContext>) {
  const sql = c.get('sql');
  const params = readParams(c);

  const client = await findOAuthClient(sql, params.client_id);
  if (!client) {
    return c.json({ error: { code: 'invalid_client', message: 'Unknown client_id' } }, 400);
  }

  const redirectUris = client.redirect_uris as unknown as string[];
  if (!redirectUris.includes(params.redirect_uri)) {
    // Never redirect to an unregistered URI — respond inline.
    return c.json({ error: { code: 'invalid_redirect_uri', message: 'redirect_uri is not registered' } }, 400);
  }

  const redirectError = (error: string, description: string) => {
    const url = new URL(params.redirect_uri);
    url.searchParams.set('error', error);
    url.searchParams.set('error_description', description);
    if (params.state) url.searchParams.set('state', params.state);
    return c.redirect(url.toString(), 302);
  };

  if (params.response_type !== 'code') {
    return redirectError('unsupported_response_type', 'Only response_type=code is supported');
  }
  if (!params.code_challenge || params.code_challenge_method !== 'S256') {
    return redirectError('invalid_request', 'PKCE with code_challenge_method=S256 is required');
  }
  const allowedScopes = client.allowed_scopes as unknown as string[];
  const requestedScopes = params.scope.split(/\s+/).filter(Boolean);
  if (requestedScopes.some((s) => !allowedScopes.includes(s))) {
    return redirectError('invalid_scope', 'Requested scope is not allowed for this client');
  }

  // Require a signed-in session; otherwise show the branded login page.
  const authed = await resolveSession(c);
  if (!authed) {
    return c.html(
      renderLoginPage({
        client,
        continueUrl: c.req.url,
        mode: 'login',
      })
    );
  }

  const session = c.get('session')!;
  const user = await findUserById(sql, session.userId);
  if (!user || user.status !== 'active') {
    return c.html(renderLoginPage({ client, continueUrl: c.req.url, mode: 'login' }));
  }

  // Resolve current organization for the org_id claim downstream.
  let organizationId = session.organizationId;
  if (!organizationId) {
    const orgs = await listUserOrganizations(sql, user.id);
    organizationId = orgs[0]?.id ?? null;
  }

  const code = randomToken(32);
  const codeHash = await sha256Hex(code);

  await sql`
    INSERT INTO authorization_codes (code_hash, user_id, client_id, organization_id, redirect_uri, scope, expires_at)
    VALUES (${codeHash}, ${user.id}, ${client.client_id}, ${organizationId}, ${params.redirect_uri},
            ${requestedScopes.join(' ')}, NOW() + INTERVAL '5 minutes')`;

  await c.env.PKCE_STORAGE.put(
    pkceKvKey(codeHash),
    JSON.stringify({ challenge: params.code_challenge, method: 'S256' }),
    { expirationTtl: AUTH_CODE_TTL_SECONDS }
  );

  const url = new URL(params.redirect_uri);
  url.searchParams.set('code', code);
  if (params.state) url.searchParams.set('state', params.state);
  return c.redirect(url.toString(), 302);
}
