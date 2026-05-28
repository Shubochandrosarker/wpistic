// Thin REST client. Always sends the WP nonce for cookie-authenticated
// dashboard requests, normalizes errors, and resolves namespaces from boot.

import { boot } from './boot.js';

const trimSlashes = (s) => s.replace(/^\/+|\/+$/g, '');

function buildUrl(path, ns) {
  const base = boot.restUrl.replace(/\/+$/, '');
  const namespace = boot.restNamespaces[ns] || ns;
  return `${base}/${trimSlashes(namespace)}/${trimSlashes(path)}`;
}

async function request(method, path, { ns = 'wpistic', body, params } = {}) {
  let url = buildUrl(path, ns);
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { 'X-WP-Nonce': boot.nonce };
  const opts = { method, credentials: 'same-origin', headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    throw new ApiError('network_error', 'Network error — check your connection.', 0);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message = data?.message || `Request failed (${res.status}).`;
    const code = data?.code || 'http_error';
    throw new ApiError(code, message, res.status, data);
  }

  return data;
}

export class ApiError extends Error {
  constructor(code, message, status, data) {
    super(message);
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts),

  // Namespaced convenience helpers mirroring the documented endpoint groups.
  wpistic: (path, opts) => request('GET', path, { ...opts, ns: 'wpistic' }),
  memberistic: (path, opts) => request('GET', path, { ...opts, ns: 'memberistic' }),
  licenseistic: (path, opts) => request('GET', path, { ...opts, ns: 'licenseistic' }),
};
