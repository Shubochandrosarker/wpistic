import { describe, expect, it, vi } from 'vitest';
import { PlatformClient } from './index';

describe('PlatformClient', () => {
  it('sends auth, org, and correlation headers for catalog requests', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ products: [] }), { status: 200 })
    );
    const client = new PlatformClient({
      baseUrl: 'https://api.example.test/',
      getAccessToken: () => 'access-token',
      getOrganizationId: () => '00000000-0000-0000-0000-000000000001',
      fetchImpl,
    });

    await client.listProducts();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/api/v1/products');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('X-Organization-Id')).toBe('00000000-0000-0000-0000-000000000001');
    expect(headers.get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('claims free products with an idempotency key and no payment payload', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ claim: { id: 'grant-1' }, repeated: false, license: null }), { status: 201 })
    );
    const client = new PlatformClient({ baseUrl: 'https://api.example.test', getAccessToken: () => null, fetchImpl });

    await client.claimFreeProduct('00000000-0000-0000-0000-000000000001', 'memberistic');

    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.parse(String(init?.body))).toEqual({ limit_overrides: {} });
    expect(String(init?.body)).not.toMatch(/stripe|card|payment/i);
  });
});
