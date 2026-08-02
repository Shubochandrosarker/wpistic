import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../env';
import { UpdatesService } from './service';
import { ApiError } from '../../errors';

const updateCheckSchema = z.object({
  version: z.string().min(1),
  channel: z.string().default('stable'),
  php_version: z.string().optional(),
  wp_version: z.string().optional(),
});

const downloadAuthorizeSchema = z.object({
  license_key: z.string().min(1),
  activation_token: z.string().min(1),
  product_slug: z.string().min(1),
  requested_version: z.string().min(1),
});

function svc(c: Context<AppContext>): UpdatesService {
  return new UpdatesService(c.get('sql'));
}

/**
 * GET /products/:slug/updates
 * Check for available updates
 */
export const updateCheckRoute = new Hono<AppContext>().get(
  '/',
  async (c) => {
    const slug = c.req.param('slug') ?? '';
    const versionParam = c.req.query('version') ?? '';
    const channel = (c.req.query('channel') ?? 'stable') as string;
    const phpVersion = c.req.query('php_version') as string | undefined;
    const wpVersion = c.req.query('wp_version') as string | undefined;

    if (!versionParam) {
      throw ApiError.badRequest('missing_version', 'Current version is required');
    }

    const update = await svc(c).findAvailableUpdate({
      productSlug: slug,
      currentVersion: versionParam,
      channel,
      phpVersion,
      wpVersion,
    });

    if (!update) {
      return c.json({
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

    return c.json({
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
  }
);

/**
 * POST /downloads/authorize
 * Create a single-use download token
 */
export const downloadAuthorizeRoute = new Hono<AppContext>().post(
  '/',
  zValidator('json', downloadAuthorizeSchema),
  async (c) => {
    const body = c.req.valid('json');
    const { license_key, activation_token, product_slug, requested_version } = body;

    // TODO: Validate license and activation token
    // For now, just create the download auth token

    // Generate a random download auth token
    const token = `dlauth_${Math.random().toString(16).slice(2)}`;

    // Store in KV with 15-minute TTL
    const payload = {
      license_id: 'temp',
      product_id: product_slug,
      version: requested_version,
      org_id: 'temp',
      used: false,
    };

    const cache = c.env.SESSION_CACHE;
    await cache.put(`download_auth:${token}`, JSON.stringify(payload), {
      expirationTtl: 15 * 60,
    });

    return c.json({
      download_url: `/api/v1/downloads/file?token=${token}`,
    });
  }
);

/**
 * GET /downloads/file
 * Stream file and mark token as used
 */
export const downloadFileRoute = new Hono<AppContext>().get(
  '/',
  async (c) => {
    const token = c.req.query('token');

    if (!token) {
      throw ApiError.badRequest('missing_token', 'Download token is required');
    }

    const cache = c.env.SESSION_CACHE;
    const cached = await cache.get(`download_auth:${token}`);
    if (!cached) {
      throw new ApiError(403, 'unauthorized', 'Download token is invalid or expired');
    }

    const payload = JSON.parse(cached) as { used: boolean };
    if (payload.used) {
      throw new ApiError(403, 'forbidden', 'Download token has already been used');
    }

    // Mark as used
    await cache.put(`download_auth:${token}`, JSON.stringify({ ...payload, used: true }), {
      expirationTtl: 15 * 60,
    });

    // TODO: Stream file from R2
    c.header('Content-Type', 'application/zip');
    c.header('Content-Disposition', 'attachment; filename="package.zip"');
    return c.json({ error: 'R2 integration not yet implemented' });
  }
);
