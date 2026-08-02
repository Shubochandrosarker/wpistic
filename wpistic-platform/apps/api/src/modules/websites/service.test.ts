/**
 * Tests for WebsiteService: registration, connection limits, heartbeat,
 * disconnect cascade, and tenant isolation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockSql, createMockEventBus, testData } from '../../test/setup';
import { WebsiteService } from './service';
import { ApiError } from '../../errors';

describe('WebsiteService', () => {
  let websiteService: WebsiteService;
  let mockSql: any;
  let mockEvents: any;

  beforeEach(() => {
    mockSql = createMockSql();
    mockEvents = createMockEventBus();
    websiteService = new WebsiteService(mockSql, mockEvents);
  });

  describe('addForOrg', () => {
    it('should create website with normalized domain and a wpconn_ token', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website }]);

      const result = await websiteService.addForOrg(testData.uuids.org, {
        domain: 'https://EXAMPLE.COM/',
        name: 'My Site',
        environment: 'production',
      });

      expect(result.website.id).toBe(testData.uuids.website);
      expect(result.connection_token).toMatch(/^wpconn_[a-f0-9]{32}$/);
    });
  });

  describe('connect', () => {
    const license = { organization_id: testData.uuids.org, product_id: testData.uuids.product, max_websites: 2 };

    it('enforces max_websites before creating a new connection', async () => {
      mockSql.mockResolvedValueOnce([{ count: '2' }]); // already at the limit

      await expect(
        websiteService.connect(license, { domain: 'new-site.com', environment: 'production' })
      ).rejects.toThrow(/max_websites_reached|allows 2/);
    });

    it('allows connecting when under the limit and records the installation', async () => {
      mockSql.mockResolvedValueOnce([{ count: '1' }]); // under the limit
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website }]); // upsert website
      mockSql.mockResolvedValueOnce([]); // upsert website_installations

      const result = await websiteService.connect(license, {
        domain: 'example.com',
        environment: 'production',
        wp_version: '6.6',
        php_version: '8.2',
        product_version: '2.0.0',
      });

      expect(result.website_id).toBe(testData.uuids.website);
      expect(result.connection_token).toMatch(/^wpconn_[a-f0-9]{32}$/);
      expect(mockEvents.publish).toHaveBeenCalledWith('website.connected', expect.any(Object));
    });

    it('does not count the domain being (re)connected against its own limit', async () => {
      mockSql.mockResolvedValueOnce([{ count: '0' }]);
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website }]);
      mockSql.mockResolvedValueOnce([]);

      await expect(
        websiteService.connect({ ...license, max_websites: 1 }, { domain: 'example.com', environment: 'production' })
      ).resolves.toBeTruthy();
    });
  });

  describe('heartbeat', () => {
    it('fails closed when no token is supplied', async () => {
      await expect(websiteService.heartbeat('', { wp_version: '6.6' })).rejects.toThrow(/required/i);
    });

    it('fails closed on an unrecognized token', async () => {
      mockSql.mockResolvedValueOnce([]);
      await expect(websiteService.heartbeat('wpconn_unknown', { wp_version: '6.6' })).rejects.toThrow(/invalid/i);
    });

    it('updates sync state and returns website_id + next_heartbeat_after', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website, organization_id: testData.uuids.org }]); // token lookup
      mockSql.mockResolvedValueOnce([]); // UPDATE websites

      const result = await websiteService.heartbeat('wpconn_test', { wp_version: '6.6', php_version: '8.2', health: 'healthy' });

      expect(result.ok).toBe(true);
      expect(result.website_id).toBe(testData.uuids.website);
      expect(typeof result.next_heartbeat_after).toBe('number');
    });
  });

  describe('domain normalization', () => {
    it('should normalize domains consistently', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website }]);

      await websiteService.addForOrg(testData.uuids.org, {
        domain: 'https://Example.COM:8080/path',
        name: 'Test',
      });

      expect(mockSql.mock.calls[0]).toContain('example.com');
    });
  });

  describe('disconnect', () => {
    it('revokes the connection token and marks the website offline', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website }]);
      await expect(websiteService.disconnect(testData.uuids.org, testData.uuids.website)).resolves.toBeUndefined();
      expect(mockSql.mock.calls[0][0].join('')).toContain('offline');
    });

    it('throws not_found when the website does not belong to this org', async () => {
      mockSql.mockResolvedValueOnce([]);
      await expect(websiteService.disconnect('other-org', testData.uuids.website)).rejects.toThrow(ApiError);
    });
  });

  describe('tenant isolation', () => {
    it('should only list websites for own organization', async () => {
      mockSql.mockResolvedValueOnce([]);
      await websiteService.listForOrg(testData.uuids.org);
      expect(mockSql.mock.calls[0]).toContain(testData.uuids.org);
    });
  });
});
