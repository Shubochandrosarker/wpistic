/**
 * TOTP verification (RFC 6238, SHA-1, 6 digits, 30s period) + AES-GCM
 * decryption of the stored MFA secret. Used by admin impersonation, which
 * requires a fresh MFA proof on top of the admin's authenticated session.
 */

function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, BigInt(counter));
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    (((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!) %
    1_000_000;
  return code.toString().padStart(6, '0');
}

export async function verifyTotpCode(base32Secret: string, code: string, windowSteps = 1): Promise<boolean> {
  const secret = base32Decode(base32Secret);
  if (secret.length === 0) return false;
  const normalized = code.replace(/\s/g, '');
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    if ((await hotp(secret, counter + offset)) === normalized) return true;
  }
  return false;
}

/** Mirror of the account service's AES-GCM secret encryption (iv || ciphertext, base64). */
export async function decryptMfaSecret(encoded: string, base64Key: string): Promise<string> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12));
  return new TextDecoder().decode(plaintext);
}
