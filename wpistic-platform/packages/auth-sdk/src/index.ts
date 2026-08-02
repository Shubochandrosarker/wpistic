/**
 * @wpistic/auth-sdk — browser-side OAuth 2.1 + PKCE flow against
 * account.wpistic.com. Used by app.wpistic.com and every product app
 * (Chatbotistic, Insightistic, ...) so the login flow is implemented once.
 *
 * Access tokens are kept in memory only. The refresh token is persisted via a
 * pluggable storage (default sessionStorage) and rotated on every refresh.
 * Never place tokens in plain localStorage on shared machines — hosts that can
 * use httpOnly cookies (server-rendered apps) should prefer them.
 */

export interface AuthConfig {
  /** e.g. https://account.wpistic.com */
  accountUrl: string;
  /** OAuth client id, e.g. 'wpistic_dashboard' or 'chatbotistic' */
  clientId: string;
  /** Registered redirect URI, e.g. https://app.wpistic.com/auth/callback */
  redirectUri: string;
  scope?: string;
  /** Storage for the pending PKCE state + refresh token. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  token_type: 'Bearer';
  expires_in: number;
  /** epoch ms computed client-side */
  expires_at: number;
}

const PKCE_KEY = 'wpistic.pkce';
const REFRESH_KEY = 'wpistic.refresh_token';

function storageOf(config: AuthConfig): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  return config.storage ?? window.sessionStorage;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return base64UrlEncode(bytes); // 64 chars, within the 43–128 spec range
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Begin the login flow: stash verifier+state, then redirect the browser to the
 * branded authorize page. `returnTo` is restored after the callback completes.
 */
export async function startLogin(config: AuthConfig, options: { returnTo?: string } = {}): Promise<void> {
  const verifier = generateCodeVerifier();
  const state = generateState();
  const challenge = await generateCodeChallenge(verifier);
  storageOf(config).setItem(
    PKCE_KEY,
    JSON.stringify({ verifier, state, returnTo: options.returnTo ?? window.location.pathname })
  );

  const url = new URL('/authorize', config.accountUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scope ?? 'openid profile email org');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  window.location.assign(url.toString());
}

/**
 * Complete the flow on the /auth/callback page. Validates state, exchanges the
 * code, persists the refresh token, and returns the token set + returnTo path.
 */
export async function completeLogin(config: AuthConfig): Promise<{ tokens: TokenSet; returnTo: string }> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  if (error) throw new AuthError(error, params.get('error_description') ?? 'Authorization failed');
  if (!code || !state) throw new AuthError('invalid_callback', 'Missing code or state in callback URL');

  const stored = storageOf(config).getItem(PKCE_KEY);
  storageOf(config).removeItem(PKCE_KEY);
  if (!stored) throw new AuthError('missing_pkce', 'No pending login found — start the login flow again');
  const { verifier, state: expectedState, returnTo } = JSON.parse(stored) as {
    verifier: string;
    state: string;
    returnTo: string;
  };
  if (state !== expectedState) throw new AuthError('state_mismatch', 'OAuth state mismatch');

  const tokens = await exchangeCode(config, code, verifier);
  storageOf(config).setItem(REFRESH_KEY, tokens.refresh_token);
  return { tokens, returnTo: returnTo || '/' };
}

export async function exchangeCode(config: AuthConfig, code: string, verifier: string): Promise<TokenSet> {
  return requestTokens(config, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });
}

/** Refresh using the stored rotating refresh token. Returns null when absent/invalid. */
export async function refreshTokens(config: AuthConfig): Promise<TokenSet | null> {
  const refreshToken = storageOf(config).getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const tokens = await requestTokens(config, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
    });
    storageOf(config).setItem(REFRESH_KEY, tokens.refresh_token);
    return tokens;
  } catch (err) {
    if (err instanceof AuthError && err.code !== 'network_error') {
      storageOf(config).removeItem(REFRESH_KEY);
    }
    return null;
  }
}

export function clearStoredAuth(config: AuthConfig): void {
  storageOf(config).removeItem(PKCE_KEY);
  storageOf(config).removeItem(REFRESH_KEY);
}

/** Revoke the session server-side, then clear local state. */
export async function logout(config: AuthConfig, accessToken: string | null): Promise<void> {
  try {
    if (accessToken) {
      await fetch(new URL('/logout', config.accountUrl), {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
    }
  } finally {
    clearStoredAuth(config);
  }
}

async function requestTokens(config: AuthConfig, body: Record<string, string>): Promise<TokenSet> {
  let res: Response;
  try {
    res = await fetch(new URL('/token', config.accountUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
  } catch {
    throw new AuthError('network_error', 'Could not reach the account service');
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new AuthError(
      typeof json.error === 'string' ? json.error : 'token_error',
      typeof json.error_description === 'string' ? json.error_description : `Token request failed (${res.status})`
    );
  }
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 900;
  return {
    ...(json as unknown as Omit<TokenSet, 'expires_at'>),
    expires_at: Date.now() + expiresIn * 1000,
  };
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Decode a JWT payload without verification (for reading org_id/exp client-side). */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64)))) as T;
  } catch {
    return null;
  }
}
