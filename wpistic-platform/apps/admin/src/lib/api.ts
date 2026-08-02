/**
 * Server-side admin API client. Runs only in the Astro Worker — the
 * Staff access tokens never reach the browser. Client-side islands that need
 * mutations call the same-origin /api/proxy endpoint instead.
 */
import type { AstroGlobal } from 'astro';

export interface AdminApiContext {
  apiUrl: string;
  token: string;
}

export function adminContext(Astro: AstroGlobal): AdminApiContext {
  const env = Astro.locals.runtime.env;
  const token = Astro.locals.admin?.accessToken;
  if (!token) throw new Error('Admin session is required');
  return { apiUrl: env.API_URL, token };
}

export async function adminGet<T>(ctx: AdminApiContext, endpoint: string): Promise<T> {
  const res = await fetch(`${ctx.apiUrl}/api/v1/admin${endpoint}`, {
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Admin API request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function adminPost<T>(ctx: AdminApiContext, endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${ctx.apiUrl}/api/v1/admin${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const parsed = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(parsed?.error?.message ?? `Admin API request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}
