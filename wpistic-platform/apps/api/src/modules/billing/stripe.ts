/**
 * Minimal fetch-based Stripe client (no SDK dependency — Workers friendly).
 * Form-encodes nested params with Stripe's bracket notation and verifies
 * webhook signatures (t=...,v1=... scheme) with Web Crypto.
 */
import { hmacSha256Hex, timingSafeEqual } from '../../utils/crypto';

const STRIPE_API = 'https://api.stripe.com/v1';

function encodeForm(params: Record<string, unknown>, prefix = ''): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          parts.push(...encodeForm(item as Record<string, unknown>, `${name}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === 'object') {
      parts.push(...encodeForm(value as Record<string, unknown>, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

export class StripeError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'StripeError';
  }
}

export class StripeClient {
  constructor(private secretKey: string) {}

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, params?: Record<string, unknown>): Promise<T> {
    const body = params ? encodeForm(params).join('&') : undefined;
    const url = method === 'GET' && body ? `${STRIPE_API}${path}?${body}` : `${STRIPE_API}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2024-06-20',
      },
      body: method === 'GET' ? undefined : body,
    });
    const json = (await res.json()) as T & { error?: { code?: string; message?: string } };
    if (!res.ok) {
      throw new StripeError(res.status, json.error?.code ?? 'stripe_error', json.error?.message ?? 'Stripe request failed');
    }
    return json;
  }

  createCustomer(params: { email?: string; name?: string; metadata?: Record<string, string> }) {
    return this.request<{ id: string }>('POST', '/customers', params);
  }

  createCheckoutSession(params: Record<string, unknown>) {
    return this.request<{ id: string; url: string }>('POST', '/checkout/sessions', params);
  }

  createBillingPortalSession(params: { customer: string; return_url: string }) {
    return this.request<{ url: string }>('POST', '/billing_portal/sessions', params);
  }

  getSubscription(id: string) {
    return this.request<Record<string, unknown>>('GET', `/subscriptions/${id}`);
  }

  cancelAtPeriodEnd(subscriptionId: string) {
    return this.request<Record<string, unknown>>('POST', `/subscriptions/${subscriptionId}`, {
      cancel_at_period_end: true,
    });
  }
}

/** Verify a Stripe-Signature header: t=<ts>,v1=<hex hmac of `${t}.${payload}`>. */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300
): Promise<boolean> {
  if (!header) return false;
  const parts = new Map<string, string[]>();
  for (const piece of header.split(',')) {
    const [k, v] = piece.split('=', 2);
    if (!k || !v) continue;
    const list = parts.get(k.trim()) ?? [];
    list.push(v.trim());
    parts.set(k.trim(), list);
  }
  const timestamp = parseInt(parts.get('t')?.[0] ?? '', 10);
  const signatures = parts.get('v1') ?? [];
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  return signatures.some((sig) => timingSafeEqual(sig, expected));
}
