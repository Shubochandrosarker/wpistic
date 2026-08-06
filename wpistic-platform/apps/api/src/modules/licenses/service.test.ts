/**
 * Unit tests for LicenseService: grace period truth, token resolution
 * (replay/claim-mismatch rejection), refresh rotation, and key rotation.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import { createMockSql, createMockKV, testData } from '../../test/setup';
import { LicenseService, evaluateLicenseLifecycle, type LicenseRow, type ActivationRow } from './service';
import { signActivationToken, sha256Hex } from '../../utils/crypto';

describe('evaluateLicenseLifecycle', () => {
  const base = { status: 'active' as const, expires_at: null as string | null, grace_period_ends_at: null as string | null };

  it('is usable when not yet expired', () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    const result = evaluateLicenseLifecycle({ ...base, expires_at: future });
    expect(result.usable).toBe(true);
    expect(result.effectiveStatus).toBe('active');
  });

  it('allows grace period at day 6 of 7', () => {
    const expiresAt = new Date(Date.now() - 6 * 86400_000);
    const graceEndsAt = new Date(expiresAt.getTime() + 7 * 86400_000); // 1 day of grace remaining
    const result = evaluateLicenseLifecycle({ ...base, expires_at: expiresAt.toISOString(), grace_period_ends_at: graceEndsAt.toISOString() });
    expect(result.usable).toBe(true);
    expect(result.effectiveStatus).toBe('grace_period');
    expect(result.inGracePeriod).toBe(true);
  });

  it('allows grace period right up to day 7 boundary', () => {
    const expiresAt = new Date(Date.now() - 6.99 * 86400_000);
    const graceEndsAt = new Date(expiresAt.getTime() + 7 * 86400_000);
    const result = evaluateLicenseLifecycle({ ...base, expires_at: expiresAt.toISOString(), grace_period_ends_at: graceEndsAt.toISOString() });
    expect(result.usable).toBe(true);
  });

  it('blocks after grace period ends at day 8', () => {
    const expiresAt = new Date(Date.now() - 8 * 86400_000);
    const graceEndsAt = new Date(expiresAt.getTime() + 7 * 86400_000); // ended a day ago
    const result = evaluateLicenseLifecycle({ ...base, expires_at: expiresAt.toISOString(), grace_period_ends_at: graceEndsAt.toISOString() });
    expect(result.usable).toBe(false);
    expect(result.effectiveStatus).toBe('expired');
  });

  it('treats revoked/suspended/cancelled as unusable regardless of expiry', () => {
    for (const status of ['revoked', 'suspended', 'cancelled'] as const) {
      const result = evaluateLicenseLifecycle({ ...base, status });
      expect(result.usable).toBe(false);
      expect(result.effectiveStatus).toBe(status);
    }
  });
});

describe('LicenseService', () => {
  let mockSql: any;
  let mockKV: KVNamespace;
  let privateKeyPem: string;
  let publicKeyPem: string;
  let licenseService: LicenseService;

  const config = () => ({ signingSecret: 'test-secret-key-32-characters-minimum', jwtPrivateKey: privateKeyPem, jwtPublicKey: publicKeyPem });

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    privateKeyPem = await exportPKCS8(privateKey);
    publicKeyPem = await exportSPKI(publicKey);
  });

  beforeEach(() => {
    mockSql = createMockSql();
    mockKV = createMockKV();
    licenseService = new LicenseService(mockSql, config(), mockKV);
  });

  const licenseRow = (overrides: Partial<LicenseRow> = {}): LicenseRow => ({
    id: testData.uuids.license,
    organization_id: testData.uuids.org,
    product_id: testData.uuids.product,
    plan_id: testData.uuids.plan,
    subscription_id: null,
    key_hash: 'a'.repeat(64),
    key_mask: 'testprod_****abcd',
    key_prefix: 'testprod_',
    status: 'active',
    max_activations: 5,
    max_websites: 1,
    expires_at: null,
    grace_period_ends_at: null,
    product_slug: 'testprod',
    product_name: 'Test Product',
    plan_slug: 'professional',
    ...overrides,
  });

  const activationRow = (tokenHash: string, overrides: Partial<ActivationRow> = {}): ActivationRow => ({
    id: testData.uuids.activation,
    license_id: testData.uuids.license,
    organization_id: testData.uuids.org,
    website_id: testData.uuids.website,
    domain_normalized: 'example.com',
    installation_uuid: 'install-uuid-123',
    environment: 'production',
    status: 'active',
    token_hash: tokenHash,
    ...overrides,
  });

  const baseClaims = {
    sub: testData.uuids.activation,
    license_id: testData.uuids.license,
    org_id: testData.uuids.org,
    product_id: testData.uuids.product,
    domain: 'example.com',
    environment: 'production',
    installation_uuid: 'install-uuid-123',
  };

  describe('resolveActivationToken', () => {
    it('resolves a valid, current token', async () => {
      const token = await signActivationToken(privateKeyPem, baseClaims, 3600);
      const tokenHash = await sha256Hex(token);
      mockSql.mockResolvedValueOnce([licenseRow()]);
      mockSql.mockResolvedValueOnce([activationRow(tokenHash)]);

      const { license, activation } = await licenseService.resolveActivationToken(token);
      expect(license.id).toBe(testData.uuids.license);
      expect(activation.id).toBe(testData.uuids.activation);
    });

    it('rejects a token on the revocation blocklist (replay after revocation)', async () => {
      const token = await signActivationToken(privateKeyPem, baseClaims, 3600);
      const tokenHash = await sha256Hex(token);
      await mockKV.put(`revoked_token:${tokenHash}`, 'true', { expirationTtl: 60 });

      await expect(licenseService.resolveActivationToken(token)).rejects.toThrow(/revoked/i);
    });

    it('rejects an expired token', async () => {
      const token = await signActivationToken(privateKeyPem, baseClaims, -60);
      await expect(licenseService.resolveActivationToken(token)).rejects.toThrow(/invalid or expired/i);
    });

    it('rejects when the domain claim no longer matches the activation record', async () => {
      const token = await signActivationToken(privateKeyPem, baseClaims, 3600);
      const tokenHash = await sha256Hex(token);
      mockSql.mockResolvedValueOnce([licenseRow()]);
      mockSql.mockResolvedValueOnce([activationRow(tokenHash, { domain_normalized: 'different-site.com' })]);

      await expect(licenseService.resolveActivationToken(token)).rejects.toThrow(/no longer valid/i);
    });

    it('rejects a token superseded by a newer one (stale token_hash after refresh/rotation)', async () => {
      const token = await signActivationToken(privateKeyPem, baseClaims, 3600);
      mockSql.mockResolvedValueOnce([licenseRow()]);
      mockSql.mockResolvedValueOnce([activationRow('some-other-current-hash')]);

      await expect(licenseService.resolveActivationToken(token)).rejects.toThrow(/no longer valid/i);
    });

    it('rejects when org_id claim does not match the license', async () => {
      const token = await signActivationToken(privateKeyPem, { ...baseClaims, org_id: 'attacker-org' }, 3600);
      const tokenHash = await sha256Hex(token);
      mockSql.mockResolvedValueOnce([licenseRow()]);
      mockSql.mockResolvedValueOnce([activationRow(tokenHash, { organization_id: 'attacker-org' })]);

      await expect(licenseService.resolveActivationToken(token)).rejects.toThrow(/no longer valid/i);
    });
  });

  describe('refresh', () => {
    it('revokes the old token and issues a new one, both distinct and both hashed', async () => {
      const oldToken = await signActivationToken(privateKeyPem, baseClaims, 3600);
      const oldTokenHash = await sha256Hex(oldToken);
      // Pre-seed the entitlement cache so buildValidationResponse skips resolveForOrg's own queries.
      await mockKV.put(`ent:${testData.uuids.org}`, JSON.stringify({ entitlements: {}, sources: [], version: 1, resolved_at: new Date().toISOString() }));
      mockSql.mockResolvedValueOnce([licenseRow()]); // resolveActivationToken: loadById
      mockSql.mockResolvedValueOnce([activationRow(oldTokenHash)]); // resolveActivationToken: loadActivation
      mockSql.mockResolvedValueOnce([]); // UPDATE license_activations SET token_hash = new
      mockSql.mockResolvedValueOnce([]); // INSERT license_events (refreshed)
      mockSql.mockResolvedValueOnce([]); // channel lookup in buildValidationResponse

      const result = await licenseService.refresh(oldToken);

      expect(result.activation_token).not.toBe(oldToken);
      expect(await mockKV.get(`revoked_token:${oldTokenHash}`)).toBe('true');

      const newTokenHash = await sha256Hex(result.activation_token);
      await expect(licenseService.resolveActivationToken(oldToken)).rejects.toThrow(/revoked/i);
      expect(newTokenHash).not.toBe(oldTokenHash);
    });
  });

  describe('rotate', () => {
    it('revokes every active activation and blocklists their tokens', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.license, slug: 'testprod' }]); // license+product lookup
      mockSql.mockResolvedValueOnce([]); // UPDATE licenses SET key_hash=...
      mockSql.mockResolvedValueOnce([
        { id: 'activation-a', token_hash: 'hash-a' },
        { id: 'activation-b', token_hash: null },
      ]); // UPDATE license_activations ... RETURNING
      mockSql.mockResolvedValueOnce([]); // INSERT license_events (rotated)

      const result = await licenseService.rotate(testData.uuids.org, testData.uuids.license, { type: 'admin', id: 'admin-1' });

      expect(result.rawKey).toMatch(/^testprod_[a-f0-9]{32}$/);
      expect(await mockKV.get('revoked_token:hash-a')).toBe('true');
    });
  });

  describe('issue', () => {
    it('derives the activation limit from the plan\u2019s <product>.sites.max entitlement', async () => {
      mockSql.mockResolvedValueOnce([{ slug: 'testprod' }]); // product lookup
      mockSql.mockResolvedValueOnce([{ value: 3 }]); // plan_entitlements lookup
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.license }]); // INSERT licenses
      mockSql.mockResolvedValueOnce([]); // license_events
      mockSql.mockResolvedValueOnce([]); // event_outbox

      const result = await licenseService.issue({
        organizationId: testData.uuids.org,
        productId: testData.uuids.product,
        planId: testData.uuids.plan,
      });

      expect(result.rawKey).toMatch(/^testprod_/);
      expect(result.rawKey).not.toBe(result.mask);
      const insert = mockSql.mock.calls.find((call: unknown[]) => (call[0] as string[]).join('').includes('INSERT INTO licenses'));
      expect(insert).toBeTruthy();
      expect(insert).toContain(3); // max_activations came from the entitlement
    });

    it('runs inside a caller-supplied transaction instead of opening its own', async () => {
      // The free-product claim folds issuance into the claim transaction so a
      // customer can never hold a grant without a key. If issue() opened its
      // own transaction here, that atomicity would be a fiction.
      const tx: any = createMockSql();
      tx.mockResolvedValueOnce([{ slug: 'testprod' }]);
      tx.mockResolvedValueOnce([{ value: 1 }]);
      tx.mockResolvedValueOnce([{ id: testData.uuids.license }]);
      tx.mockResolvedValueOnce([]);
      tx.mockResolvedValueOnce([]);

      const result = await licenseService.issue(
        {
          organizationId: testData.uuids.org,
          productId: testData.uuids.product,
          planId: testData.uuids.plan,
          actor: { type: 'user', id: testData.uuids.user },
        },
        tx
      );

      expect(result.licenseId).toBe(testData.uuids.license);
      expect(mockSql.begin).not.toHaveBeenCalled();
      expect(tx.begin).not.toHaveBeenCalled();
      // Every write landed on the caller's transaction, not the base client.
      expect(mockSql).not.toHaveBeenCalled();
      const outbox = tx.mock.calls.find((call: unknown[]) => (call[0] as string[]).join('').includes('event_outbox'));
      expect(outbox).toContain('license.issued');
    });

    it('honors an explicit activation limit over the plan entitlement', async () => {
      mockSql.mockResolvedValueOnce([{ slug: 'testprod' }]);
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.license }]);
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([]);

      await licenseService.issue({
        organizationId: testData.uuids.org,
        productId: testData.uuids.product,
        planId: testData.uuids.plan,
        maxActivations: 25,
      });

      // No entitlement lookup happens when the caller states the limit.
      const entitlementLookup = mockSql.mock.calls.find((call: unknown[]) =>
        (call[0] as string[]).join('').includes('plan_entitlements')
      );
      expect(entitlementLookup).toBeUndefined();
      const insert = mockSql.mock.calls.find((call: unknown[]) => (call[0] as string[]).join('').includes('INSERT INTO licenses'));
      expect(insert).toContain(25);
    });
  });

  describe('deactivateById', () => {
    it('marks the activation inactive, blocklists its token, and writes a transactional outbox event', async () => {
      const activation = activationRow('hash-to-revoke');
      mockSql.mockResolvedValueOnce([]); // UPDATE license_activations
      mockSql.mockResolvedValueOnce([]); // INSERT license_events
      mockSql.mockResolvedValueOnce([]); // INSERT event_outbox

      await licenseService.deactivateById(activation, 'dashboard', '127.0.0.1', { type: 'user', id: 'user-1' });

      expect(await mockKV.get('revoked_token:hash-to-revoke')).toBe('true');
      const outboxCall = mockSql.mock.calls.find((call: unknown[]) => (call[0] as string[]).join('').includes('event_outbox'));
      expect(outboxCall).toBeTruthy();
      expect(outboxCall).toContain('license.deactivated');
    });
  });
});
