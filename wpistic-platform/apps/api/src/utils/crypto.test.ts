/**
 * Tests for cryptographic functions: key generation, hashing, the HMAC
 * contract for license responses, and RS256 activation tokens.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import {
  generateLicenseKey,
  sha256Hex,
  sha256HexBytes,
  deriveLicenseKey,
  signLicenseResponse,
  signActivationToken,
  verifyActivationToken,
  canonicalJson,
  type ActivationTokenClaims,
} from './crypto';

describe('generateLicenseKey', () => {
  it('should generate key with prefix and 32-char hex suffix', () => {
    const { key, prefix, mask } = generateLicenseKey('testprod');
    expect(key).toMatch(/^testprod_[a-f0-9]{32}$/);
    expect(prefix).toBe('testprod_');
    expect(mask).toMatch(/^testprod_\*{4}[a-f0-9]{4}$/);
  });

  it('should generate unique keys on each call', () => {
    const key1 = generateLicenseKey('prod');
    const key2 = generateLicenseKey('prod');
    expect(key1.key).not.toBe(key2.key);
  });

  it('should mask the key without revealing the secret', () => {
    const { key, mask } = generateLicenseKey('seoistic');
    const secret = key.slice('seoistic_'.length);
    expect(mask).toContain('seoistic_');
    expect(mask).not.toContain(secret.slice(0, -4));
    expect(mask.endsWith(secret.slice(-4))).toBe(true);
  });
});

describe('sha256Hex / sha256HexBytes', () => {
  it('should be deterministic (known test vector)', async () => {
    const hash = await sha256Hex('hello');
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('should produce a 64-char hex string', async () => {
    expect(await sha256Hex('example')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should differ for different inputs', async () => {
    expect(await sha256Hex('input1')).not.toBe(await sha256Hex('input2'));
  });

  it('should hash raw bytes independently of string round-tripping (binary safety)', async () => {
    const bytes = new Uint8Array([0, 128, 255, 1, 254, 63, 200]);
    const hash1 = await sha256HexBytes(bytes);
    const hash2 = await sha256HexBytes(new Uint8Array(bytes));
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('canonicalJson', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('omits undefined values', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('HMAC contract: deriveLicenseKey + signLicenseResponse', () => {
  it('derives a 64-char hex key from master secret + license_key_hash', async () => {
    const key = await deriveLicenseKey('master-secret', 'a'.repeat(64));
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('derived key differs for different license_key_hash values', async () => {
    const key1 = await deriveLicenseKey('master', 'hash1');
    const key2 = await deriveLicenseKey('master', 'hash2');
    expect(key1).not.toBe(key2);
  });

  it('signs a payload deterministically, excluding the signature field, as hex', async () => {
    const derivedKey = await deriveLicenseKey('master', 'hash');
    const payload = { valid: true, status: 'active', signature: 'ignored' };
    const sig1 = await signLicenseResponse(derivedKey, payload);
    const sig2 = await signLicenseResponse(derivedKey, { ...payload, signature: 'different-but-excluded' });
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is order-independent for object keys (canonical JSON)', async () => {
    const derivedKey = await deriveLicenseKey('master', 'hash');
    const sig1 = await signLicenseResponse(derivedKey, { a: 1, b: 2 });
    const sig2 = await signLicenseResponse(derivedKey, { b: 2, a: 1 });
    expect(sig1).toBe(sig2);
  });

  it('differs for different derived keys', async () => {
    const keyA = await deriveLicenseKey('master-a', 'hash');
    const keyB = await deriveLicenseKey('master-b', 'hash');
    const payload = { valid: true };
    expect(await signLicenseResponse(keyA, payload)).not.toBe(await signLicenseResponse(keyB, payload));
  });

  // Golden vector shared verbatim with the WordPress SDK
  // (wordpress-sdk/tests/phpunit/HmacVerifierTest.php::testGoldenVectorMatchesPlatformApi).
  // Pins the full contract — hex encoding, null values kept, slashes and
  // unicode unescaped — so a change on either side fails one of the tests.
  it('matches the cross-language golden vector verified by the PHP SDK', async () => {
    const licenseKeyHash = await sha256Hex('insightistic_0123456789abcdef0123456789abcdef');
    expect(licenseKeyHash).toBe('7b84bfc5409cb8a396e77170e06ef708e47a11c977d0927bbb44ebd577e1fa62');

    const derivedKey = await deriveLicenseKey('wpistic-golden-vector-master-secret', licenseKeyHash);
    expect(derivedKey).toBe('2af17247559acf975100e3e5ea4fbbd5e6a8336bd80ef3e4c7bee351ffa12adb');

    const payload = {
      valid: true,
      status: 'active',
      plan: 'professional',
      product: 'insightistic',
      expires_at: '2027-01-01T00:00:00Z',
      grace_period_ends_at: null,
      check_again_after: 43200,
      portal_url: 'https://app.wpistic.com/licenses',
    };
    expect(canonicalJson(payload)).toBe(
      '{"check_again_after":43200,"expires_at":"2027-01-01T00:00:00Z","grace_period_ends_at":null,' +
        '"plan":"professional","portal_url":"https://app.wpistic.com/licenses","product":"insightistic",' +
        '"status":"active","valid":true}'
    );

    const signature = await signLicenseResponse(derivedKey, payload);
    expect(signature).toBe('a7e17a8766ed9ad2fcef29d183379ed11e393a224421d3470599383cc814b013');
  });
});

describe('RS256 activation tokens', () => {
  let privateKeyPem: string;
  let publicKeyPem: string;
  let otherPublicKeyPem: string;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    privateKeyPem = await exportPKCS8(privateKey);
    publicKeyPem = await exportSPKI(publicKey);
    const other = await generateKeyPair('RS256');
    otherPublicKeyPem = await exportSPKI(other.publicKey);
  });

  const claims = (): ActivationTokenClaims => ({
    sub: 'activation-1',
    license_id: 'license-1',
    org_id: 'org-1',
    product_id: 'product-1',
    domain: 'example.com',
    environment: 'production',
    installation_uuid: 'install-1',
  });

  it('round-trips claims through sign + verify', async () => {
    const token = await signActivationToken(privateKeyPem, claims(), 3600);
    const verified = await verifyActivationToken(publicKeyPem, token);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe('activation-1');
    expect(verified?.license_id).toBe('license-1');
    expect(verified?.domain).toBe('example.com');
    expect(verified?.installation_uuid).toBe('install-1');
  });

  it('rejects a token signed by a different key', async () => {
    const token = await signActivationToken(privateKeyPem, claims(), 3600);
    expect(await verifyActivationToken(otherPublicKeyPem, token)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signActivationToken(privateKeyPem, claims(), -10);
    expect(await verifyActivationToken(publicKeyPem, token)).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await signActivationToken(privateKeyPem, claims(), 3600);
    const parts = token.split('.');
    const json = JSON.stringify({ ...claims(), org_id: 'attacker-org' });
    const tamperedPayload = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    expect(await verifyActivationToken(publicKeyPem, tampered)).toBeNull();
  });

  it('rejects a malformed token without throwing', async () => {
    expect(await verifyActivationToken(publicKeyPem, 'not-a-jwt')).toBeNull();
  });
});
