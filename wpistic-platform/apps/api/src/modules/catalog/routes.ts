import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppContext } from '../../env';
import { DOWNLOAD_URL_TTL_SECONDS } from '../../env';
import { ApiError } from '../../errors';
import { requireOrg } from '../../middleware/tenant';
import { signCompactJwt, verifyCompactJwt } from '../../utils/crypto';
import { isNewerVersion } from '../../utils/semver';
import { LicenseService } from '../licenses/service';
import { OrgService } from '../orgs/service';

// ---------------------------------------------------------------------------
// /api/v1/products — public catalog (authenticated)
// ---------------------------------------------------------------------------

export const productRoutes = new Hono<AppContext>();

productRoutes.get('/', async (c) => {
  const products = await c.get('sql')`
    SELECT id, slug, name, description, icon_url, app_url, marketing_url, type, status
    FROM products WHERE status = 'active' ORDER BY name ASC`;
  return c.json({ products });
});

productRoutes.get('/:slug', async (c) => {
  const sql = c.get('sql');
  const products = await sql`
    SELECT id, slug, name, description, icon_url, app_url, marketing_url, type, status
    FROM products WHERE slug = ${c.req.param('slug')} LIMIT 1`;
  const product = products[0];
  if (!product) throw ApiError.notFound('Product');

  const plans = await sql`
    SELECT pl.id, pl.product_id, pl.slug, pl.name, pl.description, pl.sort_order,
           COALESCE(
             (SELECT json_agg(json_build_object(
                'id', pr.id, 'amount', pr.amount, 'currency', pr.currency,
                'interval', pr."interval", 'trial_days', pr.trial_days, 'is_default', pr.is_default)
              ORDER BY pr.amount)
              FROM prices pr WHERE pr.plan_id = pl.id AND pr.status = 'active'),
             '[]'::json) AS prices
    FROM plans pl
    WHERE pl.product_id = ${(product as { id: string }).id} AND pl.status = 'active' AND pl.is_public = TRUE
    ORDER BY pl.sort_order ASC`;

  const features = await sql`
    SELECT key, name, description, type FROM features
    WHERE product_id = ${(product as { id: string }).id} ORDER BY key ASC`;

  return c.json({ product, plans, features });
});

// ---------------------------------------------------------------------------
// GET /api/v1/products/:slug/updates — public, license-token gated
// ---------------------------------------------------------------------------

interface DownloadGrant extends Record<string, unknown> {
  rel: string; // release id
  lic: string; // license id
}

/** Registered on the main app (public path) — see index.ts. */
export async function handleProductUpdates(c: Context<AppContext>) {
  const sql = c.get('sql');
  const slug = c.req.param('slug');
  const currentVersion = c.req.query('version') ?? '0.0.0';
  const channel = c.req.query('channel') === 'beta' ? 'beta' : 'stable';
  const licenseToken = c.req.query('license_token');

  const products = await sql<{ id: string }[]>`SELECT id FROM products WHERE slug = ${slug} LIMIT 1`;
  if (!products[0]) throw ApiError.notFound('Product');
  const productId = products[0].id;

  // Update authorization requires a valid activation token for this product.
  let updatesAllowed = false;
  let licenseId: string | null = null;
  if (licenseToken) {
    const licenses = new LicenseService(sql, c.get('events'), c.env.LICENSE_SIGNING_SECRET, c.env.SESSION_CACHE);
    try {
      const { license, activation } = await licenses.resolveActivationToken(licenseToken);
      const expired = license.expires_at !== null && new Date(license.expires_at) < new Date();
      updatesAllowed =
        license.product_slug === slug && license.status === 'active' && !expired && activation.status === 'active';
      licenseId = license.id;
    } catch {
      updatesAllowed = false;
    }
  }
  if (!updatesAllowed || !licenseId) {
    return c.json({ has_update: false, update_authorized: false });
  }

  const releases = await sql<
    Array<{
      id: string;
      version: string;
      requires_php: string | null;
      requires_wp: string | null;
      tested_up_to: string | null;
      changelog_url: string | null;
      package_hash: string | null;
      package_size: number | null;
      is_security_release: boolean;
    }>
  >`
    SELECT id, version, requires_php, requires_wp, tested_up_to, changelog_url,
           package_hash, package_size, is_security_release
    FROM product_releases
    WHERE product_id = ${productId} AND status = 'published'
      AND channel IN ('stable', ${channel})
    ORDER BY published_at DESC
    LIMIT 20`;

  const latest = releases.find((r) => isNewerVersion(r.version, currentVersion));
  if (!latest) return c.json({ has_update: false });

  const downloadToken = await signCompactJwt(
    c.env.LICENSE_SIGNING_SECRET,
    { rel: latest.id, lic: licenseId } satisfies DownloadGrant,
    DOWNLOAD_URL_TTL_SECONDS
  );
  const origin = new URL(c.req.url).origin;

  return c.json({
    has_update: true,
    version: latest.version,
    requires_php: latest.requires_php,
    requires_wp: latest.requires_wp,
    changelog_url: latest.changelog_url,
    download_url: `${origin}/api/v1/downloads/file?token=${downloadToken}`,
    package_hash: latest.package_hash,
    package_size: latest.package_size,
    is_security_release: latest.is_security_release,
    tested_up_to: latest.tested_up_to,
  });
}

// ---------------------------------------------------------------------------
// /api/v1/downloads — short-lived signed package downloads from R2
// ---------------------------------------------------------------------------

export const downloadRoutes = new Hono<AppContext>();

/** POST /api/v1/downloads/authorize { activation_token, version? } */
downloadRoutes.post('/authorize', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { activation_token?: string; version?: string };
  if (!body.activation_token) {
    throw ApiError.badRequest('missing_token', 'activation_token is required');
  }
  const sql = c.get('sql');
  const licenses = new LicenseService(sql, c.get('events'), c.env.LICENSE_SIGNING_SECRET, c.env.SESSION_CACHE);
  const { license, activation } = await licenses.resolveActivationToken(body.activation_token);
  const expired = license.expires_at !== null && new Date(license.expires_at) < new Date();
  if (license.status !== 'active' || expired || activation.status !== 'active') {
    throw ApiError.forbidden('License is not eligible for downloads');
  }

  const releases = await sql<{ id: string }[]>`
    SELECT id FROM product_releases
    WHERE product_id = ${license.product_id} AND status = 'published'
      AND (${body.version ?? null}::text IS NULL OR version = ${body.version ?? null})
    ORDER BY published_at DESC LIMIT 1`;
  if (!releases[0]) throw ApiError.notFound('Release');

  const token = await signCompactJwt(
    c.env.LICENSE_SIGNING_SECRET,
    { rel: releases[0].id, lic: license.id } satisfies DownloadGrant,
    DOWNLOAD_URL_TTL_SECONDS
  );
  const origin = new URL(c.req.url).origin;
  return c.json({
    download_url: `${origin}/api/v1/downloads/file?token=${token}`,
    expires_in: DOWNLOAD_URL_TTL_SECONDS,
  });
});

/** GET /api/v1/downloads/file?token=... — streams the package from R2. */
downloadRoutes.get('/file', async (c) => {
  const token = c.req.query('token');
  if (!token) throw ApiError.badRequest('missing_token', 'token query parameter is required');
  const grant = await verifyCompactJwt<DownloadGrant>(c.env.LICENSE_SIGNING_SECRET, token);
  if (!grant) throw ApiError.unauthorized('Download link is invalid or expired');

  const releases = await c.get('sql')<Array<{ package_key: string; version: string; product_id: string }>>`
    SELECT package_key, version, product_id FROM product_releases WHERE id = ${grant.rel} LIMIT 1`;
  const release = releases[0];
  if (!release) throw ApiError.notFound('Release');

  const object = await c.env.UPDATE_PACKAGES.get(release.package_key);
  if (!object) throw ApiError.notFound('Package');

  const filename = release.package_key.split('/').pop() ?? `update-${release.version}.zip`;
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
// /api/v1/organizations/:orgId/products — owned products
// ---------------------------------------------------------------------------

export const orgProductRoutes = new Hono<AppContext>();

orgProductRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  const products = await new OrgService(c.get('sql'), c.get('events')).listOwnedProducts(orgId);
  return c.json({ products });
});
