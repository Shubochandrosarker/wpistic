import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { ApiError } from '../../errors';
import { requireOrg } from '../../middleware/tenant';
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

// Update checks and package downloads live in the updates module — see
// modules/updates/routes.ts (mounted at /api/v1/products/:slug/updates and
// /api/v1/downloads in index.ts). This module owns catalog browsing only.

// ---------------------------------------------------------------------------
// /api/v1/organizations/:orgId/products — owned products
// ---------------------------------------------------------------------------

export const orgProductRoutes = new Hono<AppContext>();

orgProductRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  const products = await new OrgService(c.get('sql'), c.get('events')).listOwnedProducts(orgId);
  return c.json({ products });
});
