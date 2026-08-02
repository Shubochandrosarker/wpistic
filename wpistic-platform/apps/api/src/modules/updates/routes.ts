import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import type { AppContext } from '../../env';
import { DOWNLOAD_URL_TTL_SECONDS } from '../../env';
import { ApiError } from '../../errors';
import { sha256Hex, sha256HexBytes } from '../../utils/crypto';
import { makeLicenseService } from '../licenses/routes';
import { evaluateLicenseLifecycle } from '../licenses/service';
import { UpdatesService, createDownloadGrant, resolveDownloadGrant } from './service';

function svc(c: Context<AppContext>): UpdatesService {
  return new UpdatesService(c.get('sql'));
}

// ---------------------------------------------------------------------------
// GET /api/v1/products/:slug/updates — public, license/activation-token gated
// (mounted directly in index.ts, not nested under productRoutes)
// ---------------------------------------------------------------------------

export async function handleProductUpdates(c: Context<AppContext>) {
  const slug = c.req.param('slug') ?? '';
  const currentVersion = c.req.query('version') ?? '0.0.0';
  const channel = c.req.query('channel') ?? 'stable';
  const installationUuid = c.req.query('installation_uuid');
  const phpVersion = c.req.query('php_version') ?? undefined;
  const wpVersion = c.req.query('wp_version') ?? undefined;
  const activationToken = c.req.query('activation_token');

  if (!activationToken || !installationUuid) {
    throw ApiError.badRequest('missing_context', 'activation_token and installation_uuid are required');
  }

  const licenses = makeLicenseService(c);
  const { license, activation } = await licenses.resolveActivationToken(activationToken);
  if (license.product_slug !== slug) throw ApiError.forbidden('Activation token does not match this product');
  if (activation.installation_uuid !== installationUuid) {
    throw ApiError.forbidden('Activation token does not match this installation');
  }

  const lifecycle = evaluateLicenseLifecycle(license);
  if (!lifecycle.usable || activation.status !== 'active') {
    throw ApiError.forbidden('This license is not authorized for updates');
  }

  const update = await svc(c).findAvailableUpdate({
    productId: license.product_id,
    currentVersion,
    channel,
    installationUuid,
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
      plan: update.required_plan_slug,
    },
    download_url: null,
    authorize_url: '/api/v1/downloads/authorize',
  });
}

// ---------------------------------------------------------------------------
// /api/v1/downloads — single-use, KV-granted, R2-streamed package downloads
// ---------------------------------------------------------------------------

const downloadAuthorizeSchema = z.object({
  license_key: z.string().min(1),
  activation_token: z.string().min(1),
  product_slug: z.string().min(1),
  requested_version: z.string().min(1),
});

export const downloadRoutes = new Hono<AppContext>();

downloadRoutes.post('/authorize', zValidator('json', downloadAuthorizeSchema), async (c) => {
  const body = c.req.valid('json');
  const licenses = makeLicenseService(c);
  const { license, activation } = await licenses.resolveActivationToken(body.activation_token);

  if ((await sha256Hex(body.license_key.trim())) !== license.key_hash) {
    throw ApiError.unauthorized('License key does not match the activation token');
  }
  if (license.product_slug !== body.product_slug) throw ApiError.forbidden('License does not cover this product');

  const lifecycle = evaluateLicenseLifecycle(license);
  if (!lifecycle.usable || activation.status !== 'active') {
    throw ApiError.forbidden('This license is not eligible for downloads');
  }

  const pkg = await svc(c).findDownloadablePackage(license.product_id, body.requested_version, license.plan_id);
  const token = await createDownloadGrant(
    c.env.SESSION_CACHE,
    { license_id: license.id, product_id: license.product_id, version: body.requested_version, package_path: pkg.package_path, org_id: license.organization_id },
    DOWNLOAD_URL_TTL_SECONDS
  );

  const origin = new URL(c.req.url).origin;
  return c.json({
    download_url: `${origin}/api/v1/downloads/file?token=${token}`,
    expires_in: DOWNLOAD_URL_TTL_SECONDS,
  });
});

downloadRoutes.get('/file', async (c) => {
  const token = c.req.query('token');
  if (!token) throw ApiError.badRequest('missing_token', 'token query parameter is required');

  const grant = await resolveDownloadGrant(c.env.SESSION_CACHE, token);
  const object = await c.env.UPDATE_PACKAGES.get(grant.package_path);
  if (!object) throw ApiError.notFound('Package');

  const filename = grant.package_path.split('/').pop() ?? `update-${grant.version}.zip`;
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(object.size),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

// ---------------------------------------------------------------------------
// Admin package management — mounted under /api/v1/admin/packages
// ---------------------------------------------------------------------------

const createPackageSchema = z.object({
  product_slug: z.string().min(1),
  channel: z.enum(['stable', 'beta', 'early_access', 'internal', 'security_hotfix']).default('stable'),
  version: z.string().min(1).max(50),
  release_notes: z.string().max(20000).optional(),
  package_base64: z.string().min(1),
  checksum: z.string().length(64).optional(),
  min_php_version: z.string().max(20).optional(),
  min_wp_version: z.string().max(20).optional(),
  required_plan_id: z.string().uuid().optional(),
  rollout_percentage: z.number().int().min(0).max(100).default(100),
  is_security_release: z.boolean().default(false),
  is_forced: z.boolean().default(false),
});

export const packageRoutes = new Hono<AppContext>();

packageRoutes.post('/', zValidator('json', createPackageSchema), async (c) => {
  const body = c.req.valid('json');
  const sql = c.get('sql');

  const products = await sql<{ id: string }[]>`SELECT id FROM products WHERE slug = ${body.product_slug} LIMIT 1`;
  if (!products[0]) throw ApiError.notFound('Product');
  const productId = products[0].id;

  const bytes = Uint8Array.from(atob(body.package_base64), (ch) => ch.charCodeAt(0));
  const computedChecksum = await sha256HexBytes(bytes);
  if (body.checksum && body.checksum !== computedChecksum) {
    throw ApiError.badRequest('checksum_mismatch', 'Provided checksum does not match the uploaded package');
  }

  const packagePath = `${body.product_slug}/${body.version}.zip`;
  await c.env.UPDATE_PACKAGES.put(packagePath, bytes);

  const service = svc(c);
  const channelId = await service.ensureChannel({ productId, channelName: body.channel });
  const pkg = await service.createPackage({
    productId,
    channelId,
    version: body.version,
    releaseNotes: body.release_notes,
    packagePath,
    packageSizeBytes: bytes.byteLength,
    packageChecksum: computedChecksum,
    minPhpVersion: body.min_php_version,
    minWpVersion: body.min_wp_version,
    requiredPlanId: body.required_plan_id,
    rolloutPercentage: body.rollout_percentage,
    isSecurityRelease: body.is_security_release,
    isForced: body.is_forced,
  });
  return c.json({ package: pkg }, 201);
});

packageRoutes.post('/:id/publish', async (c) => {
  const pkg = await svc(c).publish(c.req.param('id'));
  await c.get('events').publish('product.update.published', {
    product_id: pkg.product_id,
    version: pkg.version,
    channel: 'stable',
  });
  return c.json({ package: pkg });
});

packageRoutes.post('/:id/rollback', async (c) => {
  const pkg = await svc(c).rollback(c.req.param('id'));
  return c.json({ package: pkg });
});
