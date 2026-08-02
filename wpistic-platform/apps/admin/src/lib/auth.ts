export interface AdminRuntimeEnv {
  ACCOUNT_URL: string;
  PUBLIC_ACCOUNT_URL: string;
  API_URL: string;
  ADMIN_CLIENT_ID: string;
  ADMIN_REDIRECT_URI: string;
}

interface CookieJar {
  get(name: string): { value: string | undefined } | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
  delete(name: string, options?: Record<string, unknown>): void;
}

export interface AdminSession {
  accessToken: string;
  email?: string;
}

const ACCESS_COOKIE = 'wpistic_admin_access';
const REFRESH_COOKIE = 'wpistic_admin_refresh';
const STATE_COOKIE = 'wpistic_admin_oauth_state';
const VERIFIER_COOKIE = 'wpistic_admin_oauth_verifier';
const RETURN_COOKIE = 'wpistic_admin_return_to';

function secureOptions(request: Request, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:';
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge };
}

function cookieName(base: string, request: Request): string {
  return new URL(request.url).protocol === 'https:' ? `__Host-${base}` : base;
}

function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeReturnTo(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function requestCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

function decodeExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

export async function beginAdminLogin(request: Request, cookies: CookieJar, env: AdminRuntimeEnv): Promise<string> {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await sha256Base64Url(verifier);
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('return_to'));
  const options = secureOptions(request, 600);
  cookies.set(cookieName(STATE_COOKIE, request), state, options);
  cookies.set(cookieName(VERIFIER_COOKIE, request), verifier, options);
  cookies.set(cookieName(RETURN_COOKIE, request), returnTo, options);

  const url = new URL('/authorize', env.PUBLIC_ACCOUNT_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.ADMIN_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.ADMIN_REDIRECT_URI);
  url.searchParams.set('scope', 'openid profile email org admin');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function completeAdminLogin(
  request: Request,
  cookies: CookieJar,
  env: AdminRuntimeEnv
): Promise<string> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const expectedState = requestCookie(request, cookieName(STATE_COOKIE, request));
  const verifier = requestCookie(request, cookieName(VERIFIER_COOKIE, request));
  if (!state || !code || !expectedState || state !== expectedState || !verifier) throw new Error('Invalid admin OAuth callback');

  const response = await fetch(new URL('/token', env.ACCOUNT_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: env.ADMIN_CLIENT_ID,
      redirect_uri: env.ADMIN_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error('Admin OAuth token exchange failed');
  const tokens = (await response.json()) as { access_token?: string; refresh_token?: string };
  if (!tokens.access_token || !tokens.refresh_token) throw new Error('Admin OAuth response was incomplete');

  const options = secureOptions(request, 900);
  cookies.set(cookieName(ACCESS_COOKIE, request), tokens.access_token, options);
  cookies.set(cookieName(REFRESH_COOKIE, request), tokens.refresh_token, secureOptions(request, 30 * 86400));
  cookies.delete(cookieName(STATE_COOKIE, request), { path: '/' });
  cookies.delete(cookieName(VERIFIER_COOKIE, request), { path: '/' });
  const returnTo = requestCookie(request, cookieName(RETURN_COOKIE, request)) ?? '/';
  cookies.delete(cookieName(RETURN_COOKIE, request), { path: '/' });
  return safeReturnTo(returnTo);
}

export async function resolveAdminSession(
  request: Request,
  cookies: CookieJar,
  env: AdminRuntimeEnv
): Promise<AdminSession | null> {
  const accessName = cookieName(ACCESS_COOKIE, request);
  const refreshName = cookieName(REFRESH_COOKIE, request);
  let access = requestCookie(request, accessName);
  const refresh = requestCookie(request, refreshName);
  if (!access && !refresh) return null;

  if ((!access || (decodeExpiry(access) ?? 0) <= Math.floor(Date.now() / 1000) + 30) && refresh) {
    const response = await fetch(new URL('/token', env.ACCOUNT_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.ADMIN_CLIENT_ID, refresh_token: refresh }),
    });
    if (!response.ok) return null;
    const tokens = (await response.json()) as { access_token?: string; refresh_token?: string };
    if (!tokens.access_token || !tokens.refresh_token) return null;
    access = tokens.access_token;
    cookies.set(accessName, access, secureOptions(request, 900));
    cookies.set(refreshName, tokens.refresh_token, secureOptions(request, 30 * 86400));
  }
  return access ? { accessToken: access } : null;
}

export function clearAdminSession(request: Request, cookies: CookieJar): void {
  cookies.delete(cookieName(ACCESS_COOKIE, request), { path: '/' });
  cookies.delete(cookieName(REFRESH_COOKIE, request), { path: '/' });
}
