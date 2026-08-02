import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppContext } from '../../env';
import { ApiError } from '../../errors';
import { idempotency } from '../../middleware/idempotency';
import { requireOrg } from '../../middleware/tenant';
import { OrgService } from '../orgs/service';

// ---------------------------------------------------------------------------
// /api/v1/products — public catalog (authenticated)
// ---------------------------------------------------------------------------

export const productRoutes = new Hono<AppContext>();

productRoutes.get('/', async (c) => {
  const products = await c.get('sql')`
    SELECT id, slug, name, description, icon_url, app_url, marketing_url, type, status,
           catalog_state, acquisition_mode, public_visibility, compliance_hold, free_limits
    FROM products
    WHERE public_visibility = TRUE AND catalog_state <> 'draft'
    ORDER BY featured_order, name ASC`;
  return c.json({ products });
});

productRoutes.get('/:slug', async (c) => {
  const sql = c.get('sql');
  const products = await sql`
    SELECT id, slug, name, description, icon_url, app_url, marketing_url, type, status,
           catalog_state, acquisition_mode, public_visibility, compliance_hold, free_limits
     FROM products
     WHERE slug = ${c.req.param('slug')}
       AND public_visibility = TRUE
       AND catalog_state NOT IN ('draft', 'retired')
     LIMIT 1`;
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

/** Card-free, idempotent free-product acquisition. */
export const orgProductRoutes = new Hono<AppContext>();

orgProductRoutes.post(
  '/:slug/claim',
  idempotency({ required: true }),
  zValidator('json', z.object({ limit_overrides: z.record(z.unknown()).optional() }).default({})),
  async (c) => {
    const { orgId } = requireOrg(c);
    const user = c.get('user');
    if (!user) throw ApiError.unauthorized();
    const slug = c.req.param('slug');
    const idempotencyKey = c.req.header('X-Idempotency-Key')!;
    const overrides = c.req.valid('json').limit_overrides ?? {};
    const sql = c.get('sql');

    const result = await sql.begin(async (tx) => {
      const products = await tx<Array<{ id: string; name: string; catalog_state: string; acquisition_mode: string; compliance_hold: boolean; free_plan_id: string | null; free_limits: Record<string, unknown> }>>`
        SELECT id, name, catalog_state, acquisition_mode, compliance_hold, free_plan_id, free_limits
        FROM products WHERE slug = ${slug} LIMIT 1`;
      const product = products[0];
      if (!product) throw ApiError.notFound('Product');
      if (product.compliance_hold || product.acquisition_mode !== 'free_claim' || product.catalog_state !== 'live' || !product.free_plan_id) {
        throw ApiError.conflict('product_not_claimable', 'This product is not available for free claims');
      }

      const current = await tx<Array<{ id: string; plan_id: string; status: string; created_at: string; limit_overrides: Record<string, unknown> }>>`
        SELECT id, plan_id, status, created_at, limit_overrides
        FROM product_access_grants
        WHERE organization_id = ${orgId} AND product_id = ${product.id} AND source = 'free_claim' AND status = 'active'
        LIMIT 1`;
      if (current[0]) return { grant: current[0], product, repeated: true };

      const inserted = await tx<Array<{ id: string; plan_id: string; status: string; created_at: string; limit_overrides: Record<string, unknown> }>>`
        INSERT INTO product_access_grants
          (organization_id, product_id, plan_id, source, source_reference, limit_overrides, idempotency_key, created_by)
        VALUES (${orgId}, ${product.id}, ${product.free_plan_id}, 'free_claim', ${`free:${orgId}:${slug}`},
                ${tx.json(overrides as never)}, ${idempotencyKey}, ${user.id})
        ON CONFLICT (organization_id, product_id)
          WHERE source = 'free_claim' AND status = 'active'
        DO NOTHING
        RETURNING id, plan_id, status, created_at, limit_overrides`;
      const grant = inserted[0] ?? (await tx<Array<{ id: string; plan_id: string; status: string; created_at: string; limit_overrides: Record<string, unknown> }>>`
        SELECT id, plan_id, status, created_at, limit_overrides FROM product_access_grants
        WHERE organization_id = ${orgId} AND product_id = ${product.id}
          AND source = 'free_claim' AND status = 'active'
        ORDER BY created_at ASC LIMIT 1`)[0];
      if (!grant) throw ApiError.conflict('claim_race', 'The claim could not be completed; retry with the same idempotency key');

      const repeated = inserted.length === 0;
      if (!repeated) {
        await tx`
          INSERT INTO audit_logs (organization_id, user_id, actor_type, action, resource_type, resource_id,
                                  new_values, correlation_id)
          VALUES (${orgId}, ${user.id}, 'user', 'product.free_claimed', 'product_access_grants', ${grant.id},
                  ${tx.json({ product: slug, source: 'free_claim' } as never)}, ${c.get('correlationId')})`;
        await tx`
          INSERT INTO event_outbox (event_type, payload, organization_id)
          VALUES ('product.claimed', ${tx.json({ data: { grant_id: grant.id, org_id: orgId, product_id: product.id, plan_id: product.free_plan_id } } as never)}, ${orgId})`;
      }
      return { grant, product, repeated };
    });

    await c.env.SESSION_CACHE.delete(`ent:${orgId}`);
    return c.json({
      claim: { ...result.grant, product: result.product.name, limits: { ...result.product.free_limits, ...result.grant.limit_overrides } },
      repeated: result.repeated,
      license: null,
    }, result.repeated ? 200 : 201);
  }
);

// Update checks and package downloads live in the updates module — see
// modules/updates/routes.ts (mounted at /api/v1/products/:slug/updates and
// /api/v1/downloads in index.ts). This module owns catalog browsing only.

// ---------------------------------------------------------------------------
// /api/v1/organizations/:orgId/products — owned products
// ---------------------------------------------------------------------------

orgProductRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  const products = await new OrgService(c.get('sql'), c.get('events')).listOwnedProducts(orgId);
  return c.json({ products });
});
