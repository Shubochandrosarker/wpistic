/**
 * NOT mounted in index.ts. Superseded by the org-scoped, credential-checked
 * implementations in ../catalog/routes.ts (handleProductUpdates, downloadRoutes)
 * — keep this module's routes delegating to the same validated LicenseService
 * path rather than reimplementing update/download auth here, so this can
 * never regress into an unauthenticated download bypass if it's ever wired up.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../env';
import { UpdatesService } from './service';
import { ApiError } from '../../errors';
import { LicenseService } from '../licenses/service';
import { signCompactJwt, verifyCompactJwt } from '../../utils/crypto';

const updateCheckSchema = z.object({
  version: z.string().min(1),
  channel: z.string().default('stable'),
  php_version: z.string().optional(),
  wp_version: z.string().optional(),
});

const downloadAuthorizeSchema = z.object({
  activation_token: z.string().min(1),
  requested_version: z.string().min(1).optional(),
});

interface DownloadGrant extends Record<string, unknown> {
  pkg: string; // update_packages.id
}

function svc(c: Context<AppContext>): UpdatesService {
  return new UpdatesService(c.get('sql'));
}

function licenseSvc(c: Context<AppContext>): LicenseService {
  return new LicenseService(c.get('sql'), c.get('events'), c.env.LICENSE_SIGNING_SECRET, c.env.SESSION_CACHE);
}

/**
 * GET /products/:slug/updates
 * Check for available updates. Requires a valid activation_token so update
 * metadata (versions, package hashes) is not disclosed to unauthenticated
 * callers.
 */
export const updateCheckRoute = new Hono<AppContext>().get('/', zValidator('query', updateCheckSchema), async (c) => {
  const slug = c.req.param('slug') ?? '';
  const { version: currentVersion, channel, php_version: phpVersion, wp_version: wpVersion } = c.req.valid('query');
  const activationToken = c.req.query('activation_token');
  if (!activationToken) throw ApiError.unauthorized('activation_token is required');

  const { license, activation } = await licenseSvc(c).resolveActivationToken(activationToken);
  const expired = license.expires_at !== null && new Date(license.expires_at) < new Date();
  if (license.product_slug !== slug || license.status !== 'active' || expired || activation.status !== 'active') {
    throw ApiError.forbidden('License is not eligible for updates');
  }

  const update = await svc(c).findAvailableUpdate({
    productSlug: slug,
    currentVersion,
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
});

/**
 * POST /downloads/authorize
 * Create a single-use, HMAC-signed download token bound to a specific
 * validated license + package (mirrors catalog/routes.ts downloadRoutes).
 */
export const downloadAuthorizeRoute = new Hono<AppContext>().post(
  '/',
  zValidator('json', downloadAuthorizeSchema),
  async (c) => {
    const { activation_token, requested_version } = c.req.valid('json');

    const { license, activation } = await licenseSvc(c).resolveActivationToken(activation_token);
    const expired = license.expires_at !== null && new Date(license.expires_at) < new Date();
    if (license.status !== 'active' || expired || activation.status !== 'active') {
      throw ApiError.forbidden('License is not eligible for downloads');
    }

    const update = await svc(c).findAvailableUpdate({
      productSlug: license.product_slug,
      currentVersion: '0.0.0',
      channel: 'stable',
    });
    if (!update || (requested_version && update.version !== requested_version)) {
      throw ApiError.notFound('Release');
    }

    const token = await signCompactJwt(c.env.LICENSE_SIGNING_SECRET, { pkg: update.id } satisfies DownloadGrant, 15 * 60);

    return c.json({
      download_url: `/api/v1/downloads/file?token=${token}`,
      expires_in: 15 * 60,
    });
  }
);

/**
 * GET /downloads/file
 * Verifies the signed grant from downloadAuthorizeRoute (single source of
 * truth: the update_packages row it was minted against) before streaming.
 */
export const downloadFileRoute = new Hono<AppContext>().get('/', async (c) => {
  const token = c.req.query('token');
  if (!token) throw ApiError.badRequest('missing_token', 'Download token is required');

  const grant = await verifyCompactJwt<DownloadGrant>(c.env.LICENSE_SIGNING_SECRET, token);
  if (!grant) throw new ApiError(403, 'unauthorized', 'Download token is invalid or expired');

  const packages = await c.get('sql')<Array<{ package_path: string; version: string }>>`
    SELECT package_path, version FROM update_packages WHERE id = ${grant.pkg} LIMIT 1`;
  const pkg = packages[0];
  if (!pkg) throw ApiError.notFound('Package');

  const object = await c.env.UPDATE_PACKAGES.get(pkg.package_path);
  if (!object) throw ApiError.notFound('Package');

  const filename = pkg.package_path.split('/').pop() ?? `update-${pkg.version}.zip`;
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(object.size),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
