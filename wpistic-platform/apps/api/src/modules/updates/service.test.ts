/**
 * Tests for UpdatesService (rollout determinism, semver correctness,
 * channel/security-release/forced handling) and the single-use download
 * grant primitives (spec 5.5: replay, plan mismatch, concurrent download).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockSql, testData } from '../../test/setup';
import { UpdatesService, createDownloadGrant, resolveDownloadGrant } from './service';
import { sha256Hex } from '../../utils/crypto';
import { ApiError } from '../../errors';

function packageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pkg-1',
    product_id: testData.uuids.product,
    channel_id: 'chan-1',
    version: '2.1.0',
    release_notes: null,
    package_path: 'testprod/2.1.0.zip',
    package_size_bytes: 1024,
    package_checksum: 'a'.repeat(64),
    package_signature: null,
    min_php_version: null,
    min_wp_version: null,
    required_plan_id: null,
    rollout_percentage: 100,
    is_security_release: false,
    is_forced: false,
    status: 'published',
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    required_plan_slug: null,
    ...overrides,
  };
}

describe('UpdatesService.findAvailableUpdate', () => {
  let mockSql: any;
  let service: UpdatesService;

  beforeEach(() => {
    mockSql = createMockSql();
    service = new UpdatesService(mockSql);
  });

  it('uses semantic version comparison, not lexical (2.10.0 > 2.9.0)', async () => {
    mockSql.mockResolvedValueOnce([packageRow({ version: '2.10.0' })]);
    const result = await service.findAvailableUpdate({
      productId: testData.uuids.product,
      currentVersion: '2.9.0',
      channel: 'stable',
      installationUuid: 'install-1',
    });
    expect(result?.version).toBe('2.10.0');
  });

  it('does not offer a version that is not actually newer', async () => {
    mockSql.mockResolvedValueOnce([packageRow({ version: '2.9.0' })]);
    const result = await service.findAvailableUpdate({
      productId: testData.uuids.product,
      currentVersion: '2.9.0',
      channel: 'stable',
      installationUuid: 'install-1',
    });
    expect(result).toBeNull();
  });

  it('is deterministic per installation+version for rollout gating', async () => {
    mockSql.mockResolvedValue([packageRow({ version: '3.0.0', rollout_percentage: 50 })]);
    const first = await service.findAvailableUpdate({
      productId: testData.uuids.product,
      currentVersion: '2.0.0',
      channel: 'stable',
      installationUuid: 'same-install',
    });
    const second = await service.findAvailableUpdate({
      productId: testData.uuids.product,
      currentVersion: '2.0.0',
      channel: 'stable',
      installationUuid: 'same-install',
    });
    expect(Boolean(first)).toBe(Boolean(second));
  });

  it('bypasses rollout gating when is_forced is true', async () => {
    // rollout_percentage 0 would normally exclude every installation.
    mockSql.mockResolvedValue([packageRow({ version: '3.0.0', rollout_percentage: 0, is_forced: true })]);
    const result = await service.findAvailableUpdate({
      productId: testData.uuids.product,
      currentVersion: '2.0.0',
      channel: 'stable',
      installationUuid: 'install-1',
    });
    expect(result?.version).toBe('3.0.0');
  });

  it('crosses channels for a security release', async () => {
    mockSql.mockResolvedValueOnce([packageRow({ version: '2.5.1', is_security_release: true })]);
    const result = await service.findAvailableUpdate({
      productId: testData.uuids.product,
      currentVersion: '2.5.0',
      channel: 'beta', // package's own channel_name filter already applied in SQL; this exercises the app-side path
      installationUuid: 'install-1',
    });
    expect(result?.version).toBe('2.5.1');
  });
});

describe('UpdatesService.findDownloadablePackage', () => {
  let mockSql: any;
  let service: UpdatesService;

  beforeEach(() => {
    mockSql = createMockSql();
    service = new UpdatesService(mockSql);
  });

  it('throws not_found for a version that does not exist for this product (wrong product/version)', async () => {
    mockSql.mockResolvedValueOnce([]);
    await expect(service.findDownloadablePackage(testData.uuids.product, '9.9.9', testData.uuids.plan)).rejects.toThrow(ApiError);
  });

  it('throws forbidden when the package requires a plan the license does not have', async () => {
    mockSql.mockResolvedValueOnce([packageRow({ required_plan_id: 'plan-pro' })]);
    await expect(
      service.findDownloadablePackage(testData.uuids.product, '2.1.0', testData.uuids.plan)
    ).rejects.toThrow(/plan/i);
  });

  it('allows the download when the license plan matches the required plan', async () => {
    mockSql.mockResolvedValueOnce([packageRow({ required_plan_id: testData.uuids.plan })]);
    const pkg = await service.findDownloadablePackage(testData.uuids.product, '2.1.0', testData.uuids.plan);
    expect(pkg.package_path).toBe('testprod/2.1.0.zip');
  });
});

describe('download grant single-use semantics (database-backed)', () => {
  let mockSql: any;

  beforeEach(() => {
    mockSql = createMockSql();
  });

  const grant = { license_id: testData.uuids.license, product_id: testData.uuids.product, version: '2.1.0', package_path: 'p.zip', org_id: testData.uuids.org };

  const grantRow = {
    license_id: testData.uuids.license,
    product_id: testData.uuids.product,
    organization_id: testData.uuids.org,
    version: '2.1.0',
    package_path: 'p.zip',
    installation_uuid: null,
  };

  it('stores only the SHA-256 of the issued token, never the raw token', async () => {
    mockSql.mockResolvedValueOnce([]);
    const token = await createDownloadGrant(mockSql, grant, 900);

    expect(token).toMatch(/^dl_[a-f0-9]{64}$/);
    const insertParams = mockSql.mock.calls[0].slice(1);
    expect(insertParams).toContain(await sha256Hex(token));
    expect(insertParams).not.toContain(token);
  });

  it('resolves a grant the database consumed (row returned)', async () => {
    mockSql.mockResolvedValueOnce([grantRow]);
    const resolved = await resolveDownloadGrant(mockSql, 'dl_sometoken');
    expect(resolved.package_path).toBe('p.zip');
    expect(resolved.org_id).toBe(testData.uuids.org);
  });

  it('rejects when the database matched no row (replayed, expired, or unknown token)', async () => {
    mockSql.mockResolvedValueOnce([]);
    await expect(resolveDownloadGrant(mockSql, 'dl_already-used')).rejects.toThrow(ApiError);
  });

  it('consumes atomically: a single UPDATE guarded by used_at IS NULL and expiry, with RETURNING', async () => {
    // The atomicity guarantee lives in this query shape — exactly one
    // concurrent request can flip used_at, everyone else matches no row.
    mockSql.mockResolvedValueOnce([grantRow]);
    await resolveDownloadGrant(mockSql, 'dl_token');

    const query = mockSql.mock.calls[0][0].join('');
    expect(query).toContain('UPDATE download_grants');
    expect(query).toContain('used_at IS NULL');
    expect(query).toContain('expires_at > NOW()');
    expect(query).toContain('RETURNING');
  });
});
