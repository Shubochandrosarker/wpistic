/**
 * PKCE (RFC 7636) S256 verification. The code challenge is stored in KV at
 * authorize time (5 min TTL) keyed by the authorization code hash; the token
 * endpoint recomputes S256(code_verifier) and compares.
 */

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function computeS256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function verifyPkce(challenge: string, method: string, verifier: string): Promise<boolean> {
  if (method !== 'S256') return false;
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const computed = await computeS256Challenge(verifier);
  return computed === challenge;
}

export function pkceKvKey(codeHash: string): string {
  return `pkce:${codeHash}`;
}
