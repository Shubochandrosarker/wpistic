/**
 * Crypto helpers: hashing, random tokens, TOTP, and AES-GCM encryption of
 * MFA secrets at rest. Passwords use bcryptjs (per platform standard);
 * opaque tokens (sessions, refresh, codes) store only SHA-256 hashes.
 */
import bcrypt from 'bcryptjs';
import { Secret, TOTP } from 'otpauth';

const encoder = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Fingerprint for security alerts: UA + language + /24 subnet, hashed. */
export async function deviceFingerprint(userAgent: string, acceptLanguage: string, ip: string): Promise<string> {
  const subnet = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip.split('.').slice(0, 3).join('.');
  return sha256Hex(`${userAgent}|${acceptLanguage}|${subnet}`);
}

// ---------------------------------------------------------------------------
// TOTP (MFA)
// ---------------------------------------------------------------------------

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpUri(secret: string, email: string): string {
  return new TOTP({
    issuer: 'WPistic',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).toString();
}

export function verifyTotp(secret: string, code: string): boolean {
  const totp = new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.validate({ token: code, window: 1 }) !== null;
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomToken(5); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`.toUpperCase();
  });
}

// ---------------------------------------------------------------------------
// AES-GCM encryption for MFA secrets at rest
// ---------------------------------------------------------------------------

async function importAesKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plaintext: string, base64Key: string): Promise<string> {
  const key = await importAesKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptSecret(encoded: string, base64Key: string): Promise<string> {
  const key = await importAesKey(base64Key);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
