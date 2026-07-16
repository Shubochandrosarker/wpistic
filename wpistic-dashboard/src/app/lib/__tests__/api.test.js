import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, ApiError } from '../api.js';
import { boot } from '../boot.js';

function fakeResponse({ ok = true, status = 200, body = '' } = {}) {
  return {
    ok,
    status,
    text: async () => body,
  };
}

describe('api', () => {
  beforeEach(() => {
    boot.restUrl = 'https://example.com/wp-json/';
    boot.restNamespaces = { wpistic: 'wpistic/v1' };
    boot.nonce = 'test-nonce';
    global.fetch = vi.fn();
  });

  it('builds the request URL from restUrl + resolved namespace + path', async () => {
    global.fetch.mockResolvedValue(fakeResponse({ body: '{}' }));

    await api.get('/websites');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/wp-json/wpistic/v1/websites',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('falls back to the raw namespace string when it is not registered', async () => {
    global.fetch.mockResolvedValue(fakeResponse({ body: '{}' }));

    await api.get('/whoami', { ns: 'custom-ns' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/wp-json/custom-ns/whoami',
      expect.anything()
    );
  });

  it('trims extra slashes from the base url, namespace, and path', async () => {
    global.fetch.mockResolvedValue(fakeResponse({ body: '{}' }));
    boot.restUrl = 'https://example.com/wp-json///';

    await api.get('//websites/');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/wp-json/wpistic/v1/websites',
      expect.anything()
    );
  });

  it('appends query params only when present', async () => {
    global.fetch.mockResolvedValue(fakeResponse({ body: '{}' }));

    await api.get('/websites', { params: { limit: 5 } });
    await api.get('/licenses', { params: {} });

    expect(global.fetch.mock.calls[0][0]).toBe('https://example.com/wp-json/wpistic/v1/websites?limit=5');
    expect(global.fetch.mock.calls[1][0]).toBe('https://example.com/wp-json/wpistic/v1/licenses');
  });

  it('always sends the X-WP-Nonce header with same-origin credentials', async () => {
    global.fetch.mockResolvedValue(fakeResponse({ body: '{}' }));

    await api.get('/websites');

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['X-WP-Nonce']).toBe('test-nonce');
    expect(opts.credentials).toBe('same-origin');
  });

  it('sends a JSON body and Content-Type header on post/put', async () => {
    global.fetch.mockResolvedValue(fakeResponse({ body: '{}' }));

    await api.post('/websites', { url: 'https://a.example.com' });

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.body).toBe(JSON.stringify({ url: 'https://a.example.com' }));
  });

  it('uses the DELETE method for del()', async () => {
    global.fetch.mockResolvedValue(fakeResponse({ body: '{}' }));

    await api.del('/websites/1');

    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('resolves parsed JSON on success', async () => {
    global.fetch.mockResolvedValue(fakeResponse({ body: '{"id":1,"name":"Acme"}' }));

    const data = await api.get('/websites/1');

    expect(data).toEqual({ id: 1, name: 'Acme' });
  });

  it('resolves null for an empty success body', async () => {
    global.fetch.mockResolvedValue(fakeResponse({ status: 204, body: '' }));

    const data = await api.del('/websites/1');

    expect(data).toBeNull();
  });

  it('throws an ApiError with the servers code/message/status/data on failure', async () => {
    global.fetch.mockResolvedValue(
      fakeResponse({
        ok: false,
        status: 403,
        body: JSON.stringify({ code: 'wpistic_forbidden', message: 'Nope', data: { status: 403 } }),
      })
    );

    await expect(api.get('/websites')).rejects.toMatchObject({
      code: 'wpistic_forbidden',
      message: 'Nope',
      status: 403,
    });
  });

  it('falls back to a generic error when the failure body is not valid JSON', async () => {
    global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 500, body: 'not json' }));

    await expect(api.get('/websites')).rejects.toMatchObject({
      code: 'http_error',
      message: 'Request failed (500).',
      status: 500,
    });
  });

  it('wraps a network failure in an ApiError instead of letting fetch reject raw', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const failure = api.get('/websites');
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(api.get('/websites')).rejects.toMatchObject({ code: 'network_error', status: 0 });
  });
});
