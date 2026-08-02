/**
 * Crypto utilities: hashing, license key generation, RS256 activation
 * tokens, and the HMAC contract used to sign license validation responses.
 *
 * HMAC contract (shared verbatim with wordpress-sdk/src/Security/HmacVerifier.php):
 *   derived_key = HMAC-SHA256(LICENSE_SIGNING_SECRET, license_key_hash)
 *   signature   = HMAC-SHA256(derived_key, canonical_json(payload_without_signature))
 * Both are hex-encoded — no base64 anywhere in this contract. The plugin
 * receives `derived_key` once at activation so it can verify responses
 * offline without ever holding the master secret.
 */
import { SignJWT, importPKCS8, importSPKI, jwtVerify, errors as joseErrors } from 'jose';

const encoder = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  return sha256HexBytes(encoder.encode(input));
}

/** SHA-256 of raw bytes — use this for binary payloads; string round-tripping corrupts non-ASCII bytes. */
export async function sha256HexBytes(input: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
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

/** Canonical JSON: recursively sorted object keys, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** Per-license derived key: HMAC(master, license_key_hash), hex. */
export function deriveLicenseKey(masterSecret: string, licenseKeyHash: string): Promise<string> {
  return hmacSha256Hex(masterSecret, licenseKeyHash);
}

/** Sign a response payload (minus `signature`) with the derived key; hex encoding. */
export async function signLicenseResponse(derivedKeyHex: string, payload: Record<string, unknown>): Promise<string> {
  const { signature: _omit, ...rest } = payload;
  return hmacSha256Hex(hexToBytes(derivedKeyHex), canonicalJson(rest));
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ---------------------------------------------------------------------------
// RS256 activation tokens (JWT, `jose`)
// ---------------------------------------------------------------------------

export interface ActivationTokenClaims {
  sub: string; // activation_id
  license_id: string;
  org_id: string;
  product_id: string;
  domain: string;
  environment: string;
  installation_uuid: string;
  [key: string]: unknown;
}

const pemCache = new Map<string, Promise<CryptoKey>>();

function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, '\n');
}

function getPrivateKey(pem: string): Promise<CryptoKey> {
  let cached = pemCache.get(pem);
  if (!cached) {
    cached = importPKCS8(normalizePem(pem), 'RS256');
    pemCache.set(pem, cached);
  }
  return cached;
}

function getPublicKey(pem: string): Promise<CryptoKey> {
  let cached = pemCache.get(pem);
  if (!cached) {
    cached = importSPKI(normalizePem(pem), 'RS256');
    pemCache.set(pem, cached);
  }
  return cached;
}

/** Sign an RS256 activation token with the platform's private key. */
export async function signActivationToken(
  privateKeyPem: string,
  claims: ActivationTokenClaims,
  ttlSeconds: number
): Promise<string> {
  const key = await getPrivateKey(privateKeyPem);
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'RS256' })
    .setJti(randomHex(16))
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key);
}

/** Verify an RS256 activation token; returns claims or null (never throws). */
export async function verifyActivationToken(
  publicKeyPem: string,
  token: string
): Promise<ActivationTokenClaims | null> {
  try {
    const key = await getPublicKey(publicKeyPem);
    const { payload } = await jwtVerify(token, key, { algorithms: ['RS256'] });
    return payload as unknown as ActivationTokenClaims;
  } catch (err) {
    if (err instanceof joseErrors.JOSEError) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// License keys
// ---------------------------------------------------------------------------

/** e.g. generateLicenseKey('seoistic') → 'seoistic_9f2c...32 hex chars' */
export function generateLicenseKey(productSlug: string): { key: string; prefix: string; mask: string } {
  const prefix = `${productSlug}_`;
  const secret = randomHex(16); // 32 hex chars
  const key = `${prefix}${secret}`;
  const mask = `${prefix}****${secret.slice(-4)}`;
  return { key, prefix, mask };
}
