import type { Router, Request } from 'express';
import type { Sql } from 'postgres';
import { ApiError } from '../../errors';
import { UpdatesService } from './service';
import { LicenseService } from '../licenses/service';

export function registerUpdatesRoutes(router: Router, sql: Sql, cache: KVNamespace, signingSecret: string) {
  const updatesService = new UpdatesService(sql);
  const licenseService = new LicenseService(sql, null as any, signingSecret, cache);

  /**
   * GET /api/v1/products/:slug/updates
   * Query: ?version=&channel=&php_version=&wp_version=
   */
  router.get('/products/:slug/updates', async (req: Request, res) => {
    const { slug } = req.params;
    const { version, channel = 'stable', php_version, wp_version } = req.query;

    if (!version || typeof version !== 'string') {
      throw ApiError.badRequest('missing_version', 'Current version is required');
    }

    const update = await updatesService.findAvailableUpdate({
      productSlug: slug,
      currentVersion: version,
      channel: channel as string,
      phpVersion: php_version as string | undefined,
      wpVersion: wp_version as string | undefined,
    });

    if (!update) {
      return res.json({
        available: false,
        version: null,
        release_notes: null,
        package_size: null,
        checksum: null,
        requires: null,
        download_url: null,
        authorize_url: '/api/v1/downloads/authorize',
      });
    }

    res.json({
      available: true,
      version: update.version,
      release_notes: update.release_notes,
      package_size: update.package_size_bytes,
      checksum: update.package_checksum,
      requires: {
        php: update.min_php_version,
        wp: update.min_wp_version,
        plan: update.required_plan_id,
      },
      download_url: null,
      authorize_url: '/api/v1/downloads/authorize',
    });
  });

  /**
   * POST /api/v1/downloads/authorize
   * Body: { license_key, activation_token, product_slug, requested_version }
   */
  router.post('/downloads/authorize', async (req: Request, res) => {
    const { license_key, activation_token, product_slug, requested_version } = req.body;

    if (!license_key || !activation_token || !product_slug || !requested_version) {
      throw ApiError.badRequest('missing_fields', 'All fields are required');
    }

    // Validate activation token to ensure it's valid
    const { license } = await licenseService['resolveActivationToken'](activation_token);

    // Generate a random download auth token
    const token = `dlauth_${Math.random().toString(16).slice(2)}`;

    // Store in KV with 15-minute TTL
    const payload = {
      license_id: license.id,
      product_id: license.product_id,
      version: requested_version,
      org_id: license.organization_id,
      used: false,
    };

    await cache.put(`download_auth:${token}`, JSON.stringify(payload), {
      expirationTtl: 15 * 60,
    });

    res.json({
      download_url: `/api/v1/downloads/file?token=${token}`,
    });
  });

  /**
   * GET /api/v1/downloads/file?token=...
   */
  router.get('/downloads/file', async (req: Request, res) => {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      throw ApiError.badRequest('missing_token', 'Download token is required');
    }

    const cached = await cache.get(`download_auth:${token}`);
    if (!cached) {
      throw new ApiError(403, 'unauthorized', 'Download token is invalid or expired');
    }

    const payload = JSON.parse(cached) as { used: boolean; package_path?: string };
    if (payload.used) {
      throw new ApiError(403, 'forbidden', 'Download token has already been used');
    }

    // Mark as used
    await cache.put(`download_auth:${token}`, JSON.stringify({ ...payload, used: true }), {
      expirationTtl: 15 * 60,
    });

    // TODO: Stream file from R2
    // For now, return a placeholder
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="package.zip"');
    res.json({ error: 'R2 integration not yet implemented' });
  });
}
