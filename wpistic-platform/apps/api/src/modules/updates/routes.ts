import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import type { AppContext } from '../../env';
import { DOWNLOAD_URL_TTL_SECONDS } from '../../env';
import { ApiError } from '../../errors';
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
// /api/v1/downloads — single-use, database-granted, R2-streamed downloads
// ---------------------------------------------------------------------------

// The RS256 activation token is the sole credential: it already proves
// possession of an active activation for a specific license/installation,
// and the SDK deliberately never stores the raw license key after
// activation — requiring it here would make unattended updates impossible.
const downloadAuthorizeSchema = z.object({
  activation_token: z.string().min(1),
  product_slug: z.string().min(1),
  requested_version: z.string().min(1),
});

export const downloadRoutes = new Hono<AppContext>();

downloadRoutes.post('/authorize', zValidator('json', downloadAuthorizeSchema), async (c) => {
  const body = c.req.valid('json');
  const licenses = makeLicenseService(c);
  const { license, activation } = await licenses.resolveActivationToken(body.activation_token);

  if (license.product_slug !== body.product_slug) throw ApiError.forbidden('License does not cover this product');

  const lifecycle = evaluateLicenseLifecycle(license);
  if (!lifecycle.usable || activation.status !== 'active') {
    throw ApiError.forbidden('This license is not eligible for downloads');
  }

  const pkg = await svc(c).findDownloadablePackage(license.product_id, body.requested_version, license.plan_id);
  const token = await createDownloadGrant(
    c.get('sql'),
    {
      license_id: license.id,
      product_id: license.product_id,
      version: body.requested_version,
      package_path: pkg.package_path,
      org_id: license.organization_id,
      installation_uuid: activation.installation_uuid,
    },
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

  const grant = await resolveDownloadGrant(c.get('sql'), token);
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

const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;

const uploadPackageQuerySchema = z.object({
  product_slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  version: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[0-9A-Za-z.+-]+$/),
});

const createPackageSchema = z.object({
  product_slug: z.string().min(1),
  channel: z.enum(['stable', 'beta', 'early_access', 'internal', 'security_hotfix']).default('stable'),
  version: z.string().min(1).max(50),
  release_notes: z.string().max(20000).optional(),
  package_path: z.string().min(1).max(500),
  checksum: z.string().length(64).regex(/^[a-f0-9]{64}$/),
  min_php_version: z.string().max(20).optional(),
  min_wp_version: z.string().max(20).optional(),
  required_plan_id: z.string().uuid().optional(),
  rollout_percentage: z.number().int().min(0).max(100).default(100),
  is_security_release: z.boolean().default(false),
  is_forced: z.boolean().default(false),
});

export const packageRoutes = new Hono<AppContext>();

// Step 1 of 2: stream the raw ZIP body straight into R2. The body is never
// buffered in Worker memory (the old endpoint base64-decoded whole packages
// on the heap); R2 itself verifies the payload against the declared SHA-256
// and rejects the object on mismatch.
packageRoutes.put('/upload', zValidator('query', uploadPackageQuerySchema), async (c) => {
  const { product_slug, version } = c.req.valid('query');

  const declaredChecksum = c.req.header('x-package-checksum')?.toLowerCase() ?? '';
  if (!/^[a-f0-9]{64}$/.test(declaredChecksum)) {
    throw ApiError.badRequest('missing_checksum', 'x-package-checksum header must be the SHA-256 hex of the package');
  }

  const contentLength = Number(c.req.header('content-length') ?? NaN);
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw ApiError.badRequest('missing_content_length', 'Content-Length is required for package uploads');
  }
  if (contentLength > MAX_PACKAGE_BYTES) {
    throw ApiError.badRequest('package_too_large', `Packages are limited to ${MAX_PACKAGE_BYTES} bytes`);
  }

  const body = c.req.raw.body;
  if (!body) throw ApiError.badRequest('missing_body', 'Request body must be the raw ZIP package');

  const packagePath = `${product_slug}/${version}.zip`;
  let object: R2Object;
  try {
    object = await c.env.UPDATE_PACKAGES.put(packagePath, body, {
      sha256: declaredChecksum,
      httpMetadata: { contentType: 'application/zip' },
    });
  } catch (err) {
    throw ApiError.badRequest('checksum_mismatch', `Package rejected: ${String(err)}`);
  }

  return c.json(
    {
      package_path: packagePath,
      size_bytes: object.size,
      checksum: declaredChecksum,
    },
    201
  );
});

// Step 2 of 2: register the uploaded object as an update package. Verifies
// the object actually exists in R2 and that its stored SHA-256 matches the
// declared checksum before creating the row.
packageRoutes.post('/', zValidator('json', createPackageSchema), async (c) => {
  const body = c.req.valid('json');
  const sql = c.get('sql');

  const products = await sql<{ id: string }[]>`SELECT id FROM products WHERE slug = ${body.product_slug} LIMIT 1`;
  if (!products[0]) throw ApiError.notFound('Product');
  const productId = products[0].id;

  const object = await c.env.UPDATE_PACKAGES.head(body.package_path);
  if (!object) throw ApiError.badRequest('package_not_uploaded', 'Upload the package to R2 first (PUT /admin/packages/upload)');
  if (object.size > MAX_PACKAGE_BYTES) {
    throw ApiError.badRequest('package_too_large', `Packages are limited to ${MAX_PACKAGE_BYTES} bytes`);
  }

  const storedSha256 = object.checksums.sha256
    ? [...new Uint8Array(object.checksums.sha256)].map((b) => b.toString(16).padStart(2, '0')).join('')
    : null;
  if (storedSha256 && storedSha256 !== body.checksum) {
    throw ApiError.badRequest('checksum_mismatch', 'Declared checksum does not match the uploaded package');
  }

  const service = svc(c);
  const channelId = await service.ensureChannel({ productId, channelName: body.channel });
  const pkg = await service.createPackage({
    productId,
    channelId,
    version: body.version,
    releaseNotes: body.release_notes,
    packagePath: body.package_path,
    packageSizeBytes: object.size,
    packageChecksum: body.checksum,
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
