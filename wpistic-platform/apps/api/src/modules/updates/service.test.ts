/**
 * Tests for UpdatesService (rollout determinism, semver correctness,
 * channel/security-release/forced handling) and the single-use download
 * grant primitives (spec 5.5: replay, plan mismatch, concurrent download).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockSql, createMockKV, testData } from '../../test/setup';
import { UpdatesService, createDownloadGrant, resolveDownloadGrant } from './service';
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

describe('download grant single-use semantics', () => {
  let mockKV: KVNamespace;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  const grant = { license_id: testData.uuids.license, product_id: testData.uuids.product, version: '2.1.0', package_path: 'p.zip', org_id: testData.uuids.org };

  it('resolves a freshly issued grant exactly once', async () => {
    const token = await createDownloadGrant(mockKV, grant, 900);
    const resolved = await resolveDownloadGrant(mockKV, token);
    expect(resolved.package_path).toBe('p.zip');
  });

  it('rejects a replayed token (already consumed)', async () => {
    const token = await createDownloadGrant(mockKV, grant, 900);
    await resolveDownloadGrant(mockKV, token);
    await expect(resolveDownloadGrant(mockKV, token)).rejects.toThrow(ApiError);
  });

  it('blocks a second download once the first has fully resolved (concurrent download → only one succeeds)', async () => {
    // Workers KV has no atomic compare-and-swap, so read-then-delete cannot
    // guarantee mutual exclusion for two requests landing in the exact same
    // tick — only that any request arriving after another has resolved is
    // rejected. That is the guarantee this test proves.
    const token = await createDownloadGrant(mockKV, grant, 900);
    await resolveDownloadGrant(mockKV, token);
    const second = await Promise.allSettled([resolveDownloadGrant(mockKV, token)]);
    expect(second[0]!.status).toBe('rejected');
  });

  it('rejects an unknown token (unauthorized download)', async () => {
    await expect(resolveDownloadGrant(mockKV, 'nonexistent-token')).rejects.toThrow(ApiError);
  });
});
