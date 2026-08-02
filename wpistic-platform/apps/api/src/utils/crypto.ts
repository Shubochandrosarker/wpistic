/**
 * Crypto utilities: hashing, HMAC signing of license responses, activation
 * tokens (HS256 JWTs), and license key generation.
 *
 * Signature model: responses are HMAC-SHA256 signed with a per-license
 * verification key derived as HMAC(LICENSE_SIGNING_SECRET, license_id).
 * The plugin receives the derived key once at activation, so it can verify
 * responses offline without ever holding the master secret.
 */
const encoder = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function importHmacKey(secret: string | Uint8Array): Promise<CryptoKey> {
  const raw = typeof secret === 'string' ? encoder.encode(secret) : secret;
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function hmacSha256(secret: string | Uint8Array, message: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return new Uint8Array(sig);
}

export async function hmacSha256Hex(secret: string | Uint8Array, message: string): Promise<string> {
  const sig = await hmacSha256(secret, message);
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Per-license verification key: HMAC(master, license_id), hex. */
export function deriveLicenseVerificationKey(masterSecret: string, licenseId: string): Promise<string> {
  return hmacSha256Hex(masterSecret, `license-verification:${licenseId}`);
}

/** Canonical JSON: recursively sorted object keys, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** Derive a license key from master secret and license key hash */
export async function deriveLicenseKey(masterSecret: string, licenseKeyHash: string): Promise<string> {
  return hmacSha256Hex(masterSecret, licenseKeyHash);
}

/** Sign a response payload (minus `signature`) with the per-license key; hex encoding. */
export async function signLicenseResponse(derivedKey: string, payload: Record<string, unknown>): Promise<string> {
  const { signature: _omit, ...rest } = payload;
  return hmacSha256Hex(derivedKey, canonicalJson(rest));
}

/** Sign a response payload (minus `signature`) with the per-license key; base64 (deprecated). */
export async function signLicensePayload(verificationKeyHex: string, payload: Record<string, unknown>): Promise<string> {
  const { signature: _omit, ...rest } = payload;
  const sig = await hmacSha256(hexToBytes(verificationKeyHex), canonicalJson(rest));
  return btoa(String.fromCharCode(...sig));
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ---------------------------------------------------------------------------
// Compact HS256 JWTs for activation tokens and download grants
// ---------------------------------------------------------------------------

export interface CompactJwtPayload {
  [key: string]: unknown;
  exp: number;
  iat: number;
}

export async function signCompactJwt(secret: string, payload: Record<string, unknown>, ttlSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full: CompactJwtPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64UrlEncode(encoder.encode(JSON.stringify(full)));
  const sig = await hmacSha256(secret, `${header}.${body}`);
  return `${header}.${body}.${base64UrlEncode(sig)}`;
}

export async function verifyCompactJwt<T extends Record<string, unknown>>(
  secret: string,
  token: string
): Promise<(T & CompactJwtPayload) | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  const expected = base64UrlEncode(await hmacSha256(secret, `${header}.${body}`));
  if (!timingSafeEqual(expected, sig)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as T & CompactJwtPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// License keys
// ---------------------------------------------------------------------------

/** e.g. generateLicenseKey('seoistic') → 'seoistic_9f2c...40 hex chars' */
export function generateLicenseKey(productSlug: string): { key: string; prefix: string; mask: string } {
  const prefix = `${productSlug}_`;
  const secret = randomHex(20); // 40 hex chars
  const key = `${prefix}${secret}`;
  const mask = `${prefix}****${secret.slice(-4)}`;
  return { key, prefix, mask };
}
