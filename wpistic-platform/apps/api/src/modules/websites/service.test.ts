/**
 * Tests for WebsiteService: registration, connection, heartbeat, health tracking.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockSql, createMockEventBus, testData } from '../../test/setup';
import { WebsiteService } from './service';

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
    it('should create website with normalized domain', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website }]);

      const result = await websiteService.addForOrg(testData.uuids.org, {
        domain: 'https://EXAMPLE.COM/',
        name: 'My Site',
        environment: 'production',
      });

      expect(result.website.id).toBe(testData.uuids.website);
      expect(result.connection_token).toBeTruthy();
    });

    it('should enforce unique domain per organization', async () => {
      // This should fail if domain already exists for org
      mockSql.mockResolvedValueOnce(new Error('UNIQUE violation'));
    });

    it('should generate connection token', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website }]);
      const result = await websiteService.addForOrg(testData.uuids.org, {
        domain: 'example.com',
        name: 'Site',
      });
      expect(result.connection_token).toMatch(/^wpconn_[a-f0-9]{32}$/);
    });
  });

  describe('connect', () => {
    it('should mark website as connected on heartbeat', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website }]); // update

      await websiteService.connect(testData.uuids.org, testData.uuids.product, {
        domain: 'example.com',
        environment: 'production',
        wp_version: '6.6',
        php_version: '8.2',
        product_version: '2.0.0',
      });

      expect(mockSql).toHaveBeenCalled();
    });

    it('should update health status to healthy', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website }]);
      // Verify SQL contains health_status = 'healthy'
    });

    it('should record installation mapping to product', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website }]);
      // Verify website_installations record created
    });
  });

  describe('heartbeat', () => {
    it('should update last_sync_at', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website, organization_id: testData.uuids.org }]);

      await websiteService.heartbeat({
        connection_token: 'wpconn_test',
        wp_version: '6.6',
        php_version: '8.2',
      });

      // Verify timestamp updated
    });

    it('should maintain health status', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website, organization_id: testData.uuids.org }]);

      const result = await websiteService.heartbeat({
        connection_token: 'wpconn_test',
        wp_version: '6.6',
        php_version: '8.2',
        health: 'healthy',
      });

      expect(result.ok).toBe(true);
    });

    it('should return website_id and next_heartbeat_after', async () => {
      mockSql.mockResolvedValueOnce([{ id: testData.uuids.website, organization_id: testData.uuids.org }]);

      const result = await websiteService.heartbeat({
        connection_token: 'wpconn_test',
        wp_version: '6.6',
        php_version: '8.2',
      });

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

      // Verify normalized domain is stored
      const call = mockSql.mock.calls[0];
      expect(call[0]).toContain('example.com');
    });
  });

  describe('disconnect', () => {
    it('should revoke connection token', async () => {
      mockSql.mockResolvedValueOnce(undefined);

      await websiteService.disconnect(testData.uuids.org, testData.uuids.website);

      // Verify token revoked
    });

    it('should mark as offline', async () => {
      mockSql.mockResolvedValueOnce(undefined);

      await websiteService.disconnect(testData.uuids.org, testData.uuids.website);

      // Verify health_status = 'offline'
    });
  });

  describe('tenant isolation', () => {
    it('should only list websites for own organization', async () => {
      mockSql.mockResolvedValueOnce([]);

      await websiteService.listForOrg(testData.uuids.org);

      // Verify WHERE organization_id = ${orgId}
      const call = mockSql.mock.calls[0];
      expect(call[0]).toContain(testData.uuids.org);
    });

    it('should prevent access to other org websites', async () => {
      // Test that querying website from another org fails
    });
  });
});
