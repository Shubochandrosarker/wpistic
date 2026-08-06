/**
 * Catalog management — the super-admin surface for products, plans, prices,
 * features, and plan entitlements. This is the authoring counterpart to the
 * read-only public catalog in `modules/catalog/routes.ts`.
 *
 * Everything here writes straight through to the live tables and records a
 * before/after pair in `audit_logs`. There is no draft stage: the audit trail
 * is the undo history.
 *
 * Two invariants the routes below enforce, because nothing in the schema does:
 *
 *  - **A free-claimable product must be able to grant something.** Setting
 *    `acquisition_mode = 'free_claim'` without a `free_plan_id` produces a
 *    product the claim endpoint rejects at runtime, so it is refused here.
 *  - **Nothing customers depend on is deletable.** Products, plans, and
 *    prices with live licenses, subscriptions, or access grants can only be
 *    retired (which hides them from the catalog and stops new acquisition)
 *    and never hard-deleted, so existing entitlements keep resolving.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import type { AppContext } from '../../env';
import { ApiError } from '../../errors';
import { EntitlementService } from '../entitlements/service';
import { adminAudit, adminAuditChange, requireAdminRole, requireFreshMfa, requireStepUp } from './guards';

const SLUG = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and single hyphens');

const CATALOG_STATE = z.enum(['draft', 'coming_soon', 'beta', 'live', 'retired']);
const ACQUISITION_MODE = z.enum(['free_claim', 'paid', 'invite_only', 'compliance_hold']);
const PRODUCT_TYPE = z.enum(['saas', 'plugin', 'bundle', 'addon']);
const FEATURE_TYPE = z.enum(['boolean', 'number', 'string', 'list']);
const PRICE_INTERVAL = z.enum(['month', 'year', 'lifetime']);

const productCreateSchema = z.object({
  slug: SLUG,
  name: z.string().min(1).max(100),
  description: z.string().max(4000).optional(),
  type: PRODUCT_TYPE.default('plugin'),
  icon_url: z.string().url().max(2000).nullish(),
  app_url: z.string().url().max(255).nullish(),
  marketing_url: z.string().url().max(255).nullish(),
  catalog_state: CATALOG_STATE.default('draft'),
  acquisition_mode: ACQUISITION_MODE.default('paid'),
  public_visibility: z.boolean().default(false),
  featured_order: z.number().int().min(0).max(9999).default(0),
  seo_title: z.string().max(255).nullish(),
  seo_description: z.string().max(4000).nullish(),
  free_limits: z.record(z.unknown()).default({}),
  compliance_hold: z.boolean().default(false),
  default_release_channel: z.string().max(20).default('stable'),
  /**
   * Convenience for the common case: scaffold a `free` plan, a
   * `<slug>.sites.max` feature, and the entitlement wiring them together, then
   * point `free_plan_id` at it. Without this a new free product needs four
   * more calls before it can actually be claimed.
   */
  scaffold_free_plan: z.boolean().default(false),
  free_sites_max: z.number().int().min(1).max(1000).default(1),
});

const productUpdateSchema = productCreateSchema
  .omit({ scaffold_free_plan: true, free_sites_max: true })
  .partial()
  .extend({ free_plan_id: z.string().uuid().nullish() });

const planSchema = z.object({
  slug: SLUG,
  name: z.string().min(1).max(100),
  description: z.string().max(4000).nullish(),
  is_public: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(9999).default(0),
  status: z.enum(['active', 'archived']).default('active'),
});

const priceSchema = z.object({
  amount: z.number().int().min(0).max(100_000_000),
  currency: z.string().length(3).default('USD'),
  interval: PRICE_INTERVAL.nullish(),
  trial_days: z.number().int().min(0).max(365).default(0),
  is_default: z.boolean().default(false),
  status: z.enum(['active', 'archived']).default('active'),
  stripe_price_id: z.string().max(255).nullish(),
});

const featureSchema = z.object({
  key: z.string().min(3).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/, 'Feature keys are lowercase dotted identifiers'),
  name: z.string().min(1).max(100),
  description: z.string().max(4000).nullish(),
  type: FEATURE_TYPE.default('boolean'),
});

const entitlementsSchema = z.object({
  entitlements: z
    .array(z.object({ feature_id: z.string().uuid(), value: z.unknown() }))
    .max(200),
});

const destructiveSchema = z.object({
  reason: z.string().min(3).max(500),
  mfa_code: z.string().min(6).max(10),
});

export const adminCatalogRoutes = new Hono<AppContext>();

// Catalog authoring changes what every customer can buy and what every plugin
// is entitled to, so it sits above the support tier.
adminCatalogRoutes.use('*', requireAdminRole('platform_admin', 'super_admin'));

async function invalidateEveryOrgHoldingProduct(c: Context<AppContext>, productId: string): Promise<void> {
  const sql = c.get('sql');
  // Plan/entitlement edits change what existing customers may do, and
  // resolution is cached for 60s per org. Rather than wait that out, drop the
  // cache for every org actually holding the product.
  const orgs = await sql<{ organization_id: string }[]>`
    SELECT DISTINCT organization_id FROM (
      SELECT organization_id FROM licenses WHERE product_id = ${productId}
      UNION
      SELECT organization_id FROM product_access_grants WHERE product_id = ${productId}
      UNION
      SELECT s.organization_id FROM subscriptions s
        JOIN subscription_items si ON si.subscription_id = s.id
        WHERE si.product_id = ${productId}
    ) held`;
  const entitlements = new EntitlementService(sql, c.env.SESSION_CACHE);
  for (const row of orgs) await entitlements.invalidate(row.organization_id);
}

async function loadProduct(c: Context<AppContext>, productId: string) {
  const rows = await c.get('sql')<Array<Record<string, unknown> & { id: string; slug: string }>>`
    SELECT * FROM products WHERE id = ${productId} LIMIT 1`;
  if (!rows[0]) throw ApiError.notFound('Product');
  return rows[0];
}

/** Reference counts that decide retire-vs-delete. */
async function productUsage(c: Context<AppContext>, productId: string) {
  const [row] = await c.get('sql')<Array<{ licenses: number; grants: number; sub_items: number }>>`
    SELECT (SELECT COUNT(*)::int FROM licenses WHERE product_id = ${productId}) AS licenses,
           (SELECT COUNT(*)::int FROM product_access_grants WHERE product_id = ${productId}) AS grants,
           (SELECT COUNT(*)::int FROM subscription_items WHERE product_id = ${productId}) AS sub_items`;
  return row!;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

adminCatalogRoutes.get('/products', async (c) => {
  const products = await c.get('sql')`
    SELECT p.id, p.slug, p.name, p.description, p.type, p.status, p.icon_url, p.app_url, p.marketing_url,
           p.catalog_state, p.acquisition_mode, p.public_visibility, p.featured_order, p.compliance_hold,
           p.free_plan_id, p.free_limits, p.default_release_channel, p.created_at, p.updated_at,
           (SELECT COUNT(*)::int FROM plans pl WHERE pl.product_id = p.id) AS plan_count,
           (SELECT COUNT(*)::int FROM features f WHERE f.product_id = p.id) AS feature_count,
           (SELECT COUNT(*)::int FROM licenses l WHERE l.product_id = p.id AND l.status = 'active') AS active_licenses,
           (SELECT COUNT(*)::int FROM product_access_grants g
             WHERE g.product_id = p.id AND g.status = 'active') AS active_grants
    FROM products p
    ORDER BY p.featured_order ASC, p.name ASC`;
  return c.json({ products });
});

adminCatalogRoutes.get('/products/:productId', async (c) => {
  const sql = c.get('sql');
  const product = await loadProduct(c, c.req.param('productId'));

  const [plans, features, usage] = await Promise.all([
    sql`
      SELECT pl.id, pl.slug, pl.name, pl.description, pl.is_public, pl.sort_order, pl.status, pl.created_at,
             COALESCE((SELECT json_agg(json_build_object(
                'id', pr.id, 'amount', pr.amount, 'currency', pr.currency, 'interval', pr."interval",
                'trial_days', pr.trial_days, 'is_default', pr.is_default, 'status', pr.status,
                'stripe_price_id', pr.stripe_price_id) ORDER BY pr.amount)
              FROM prices pr WHERE pr.plan_id = pl.id), '[]'::json) AS prices,
             COALESCE((SELECT json_agg(json_build_object(
                'feature_id', pe.feature_id, 'key', f.key, 'name', f.name, 'type', f.type, 'value', pe.value)
                ORDER BY f.key)
              FROM plan_entitlements pe JOIN features f ON f.id = pe.feature_id
              WHERE pe.plan_id = pl.id), '[]'::json) AS entitlements,
             (SELECT COUNT(*)::int FROM licenses l WHERE l.plan_id = pl.id AND l.status = 'active') AS active_licenses,
             (SELECT COUNT(*)::int FROM product_access_grants g
               WHERE g.plan_id = pl.id AND g.status = 'active') AS active_grants
      FROM plans pl WHERE pl.product_id = ${product.id} ORDER BY pl.sort_order ASC, pl.slug ASC`,
    sql`SELECT id, key, name, description, type, created_at FROM features
        WHERE product_id = ${product.id} ORDER BY key ASC`,
    productUsage(c, product.id),
  ]);

  return c.json({ product, plans, features, usage });
});

adminCatalogRoutes.post('/products', requireStepUp, zValidator('json', productCreateSchema), async (c) => {
  const sql = c.get('sql');
  const body = c.req.valid('json');

  const clash = await sql<{ id: string }[]>`SELECT id FROM products WHERE slug = ${body.slug} LIMIT 1`;
  if (clash[0]) throw ApiError.conflict('slug_taken', `A product with slug "${body.slug}" already exists`);

  // A free-claimable product needs a plan to hand out. Either scaffold one now
  // or start in a mode that does not promise free access.
  if (body.acquisition_mode === 'free_claim' && !body.scaffold_free_plan) {
    throw ApiError.badRequest(
      'free_plan_required',
      'A free_claim product needs a free plan — set scaffold_free_plan, or create the product as paid and attach free_plan_id afterwards'
    );
  }

  const created = await sql.begin(async (tx) => {
    const rows = await tx<Array<{ id: string; slug: string }>>`
      INSERT INTO products (slug, name, description, type, icon_url, app_url, marketing_url,
                            catalog_state, acquisition_mode, public_visibility, featured_order,
                            seo_title, seo_description, free_limits, compliance_hold, default_release_channel)
      VALUES (${body.slug}, ${body.name}, ${body.description ?? null}, ${body.type}, ${body.icon_url ?? null},
              ${body.app_url ?? null}, ${body.marketing_url ?? null}, ${body.catalog_state},
              ${body.acquisition_mode}, ${body.public_visibility}, ${body.featured_order},
              ${body.seo_title ?? null}, ${body.seo_description ?? null},
              ${tx.json(body.free_limits as never)}, ${body.compliance_hold}, ${body.default_release_channel})
      RETURNING id, slug`;
    const product = rows[0]!;

    if (body.scaffold_free_plan) {
      const planRows = await tx<{ id: string }[]>`
        INSERT INTO plans (product_id, slug, name, description, is_public, sort_order, status)
        VALUES (${product.id}, 'free', 'Free', 'Card-free access to the core product', TRUE, 0, 'active')
        RETURNING id`;
      const planId = planRows[0]!.id;

      const featureRows = await tx<{ id: string }[]>`
        INSERT INTO features (product_id, key, name, type)
        VALUES (${product.id}, ${`${product.slug}.sites.max`}, 'Connected sites', 'number')
        RETURNING id`;
      await tx`
        INSERT INTO plan_entitlements (plan_id, feature_id, value)
        VALUES (${planId}, ${featureRows[0]!.id}, ${String(body.free_sites_max)}::jsonb)`;
      await tx`UPDATE products SET free_plan_id = ${planId} WHERE id = ${product.id}`;
    }

    return product;
  });

  await adminAudit(c, 'catalog.product.create', 'products', created.id, null, {
    slug: body.slug,
    catalog_state: body.catalog_state,
    acquisition_mode: body.acquisition_mode,
    scaffolded_free_plan: body.scaffold_free_plan,
  });
  return c.json({ product: await loadProduct(c, created.id) }, 201);
});

adminCatalogRoutes.patch('/products/:productId', requireStepUp, zValidator('json', productUpdateSchema), async (c) => {
  const sql = c.get('sql');
  const before = await loadProduct(c, c.req.param('productId'));
  const body = c.req.valid('json');

  if (body.slug && body.slug !== before.slug) {
    const clash = await sql<{ id: string }[]>`
      SELECT id FROM products WHERE slug = ${body.slug} AND id <> ${before.id} LIMIT 1`;
    if (clash[0]) throw ApiError.conflict('slug_taken', `A product with slug "${body.slug}" already exists`);
  }

  // free_plan_id must belong to this product, or the claim endpoint would
  // grant a plan from a different product entirely.
  if (body.free_plan_id) {
    const owned = await sql<{ id: string }[]>`
      SELECT id FROM plans WHERE id = ${body.free_plan_id} AND product_id = ${before.id} LIMIT 1`;
    if (!owned[0]) throw ApiError.badRequest('invalid_free_plan', 'free_plan_id must be a plan of this product');
  }

  const resultingMode = body.acquisition_mode ?? (before.acquisition_mode as string);
  const resultingFreePlan = body.free_plan_id !== undefined ? body.free_plan_id : (before.free_plan_id as string | null);
  if (resultingMode === 'free_claim' && !resultingFreePlan) {
    throw ApiError.badRequest('free_plan_required', 'A free_claim product must have free_plan_id set');
  }

  const [updated] = await sql<Array<Record<string, unknown> & { id: string }>>`
    UPDATE products SET
      slug = ${body.slug ?? (before.slug as string)},
      name = ${body.name ?? (before.name as string)},
      description = ${body.description !== undefined ? body.description : (before.description as string | null)},
      type = ${body.type ?? (before.type as string)},
      icon_url = ${body.icon_url !== undefined ? body.icon_url : (before.icon_url as string | null)},
      app_url = ${body.app_url !== undefined ? body.app_url : (before.app_url as string | null)},
      marketing_url = ${body.marketing_url !== undefined ? body.marketing_url : (before.marketing_url as string | null)},
      catalog_state = ${body.catalog_state ?? (before.catalog_state as string)},
      acquisition_mode = ${resultingMode},
      public_visibility = ${body.public_visibility ?? (before.public_visibility as boolean)},
      featured_order = ${body.featured_order ?? (before.featured_order as number)},
      seo_title = ${body.seo_title !== undefined ? body.seo_title : (before.seo_title as string | null)},
      seo_description = ${body.seo_description !== undefined ? body.seo_description : (before.seo_description as string | null)},
      free_limits = ${sql.json((body.free_limits ?? before.free_limits) as never)},
      compliance_hold = ${body.compliance_hold ?? (before.compliance_hold as boolean)},
      default_release_channel = ${body.default_release_channel ?? (before.default_release_channel as string)},
      free_plan_id = ${resultingFreePlan}
    WHERE id = ${before.id}
    RETURNING *`;

  await adminAuditChange(c, 'catalog.product.update', 'products', before.id, null, before, {
    ...body,
    free_plan_id: resultingFreePlan,
  });
  await invalidateEveryOrgHoldingProduct(c, before.id);
  return c.json({ product: updated });
});

/**
 * Retire: keep every existing entitlement resolving, stop all new acquisition
 * and hide the product from the public catalog. This is the correct action for
 * a product customers already hold.
 */
adminCatalogRoutes.post('/products/:productId/retire', zValidator('json', destructiveSchema), async (c) => {
  const body = c.req.valid('json');
  await requireFreshMfa(c, body.mfa_code);
  const before = await loadProduct(c, c.req.param('productId'));

  const [updated] = await c.get('sql')<Array<Record<string, unknown>>>`
    UPDATE products
    SET catalog_state = 'retired', acquisition_mode = 'paid', public_visibility = FALSE, free_plan_id = NULL
    WHERE id = ${before.id} RETURNING *`;

  await adminAudit(c, 'catalog.product.retire', 'products', before.id, null, {
    reason: body.reason,
    previous_state: before.catalog_state,
  });
  return c.json({ product: updated });
});

adminCatalogRoutes.delete('/products/:productId', zValidator('json', destructiveSchema), async (c) => {
  const body = c.req.valid('json');
  await requireFreshMfa(c, body.mfa_code);
  const product = await loadProduct(c, c.req.param('productId'));
  const usage = await productUsage(c, product.id);

  if (usage.licenses > 0 || usage.grants > 0 || usage.sub_items > 0) {
    throw ApiError.conflict(
      'product_in_use',
      `Cannot delete: ${usage.licenses} licenses, ${usage.grants} access grants, and ${usage.sub_items} subscription items reference this product. Retire it instead.`
    );
  }

  await c.get('sql')`DELETE FROM products WHERE id = ${product.id}`;
  await adminAudit(c, 'catalog.product.delete', 'products', product.id, null, {
    reason: body.reason,
    slug: product.slug,
  });
  return c.json({ ok: true, deleted: product.slug });
});

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

adminCatalogRoutes.post('/products/:productId/plans', requireStepUp, zValidator('json', planSchema), async (c) => {
  const sql = c.get('sql');
  const product = await loadProduct(c, c.req.param('productId'));
  const body = c.req.valid('json');

  const clash = await sql<{ id: string }[]>`
    SELECT id FROM plans WHERE product_id = ${product.id} AND slug = ${body.slug} LIMIT 1`;
  if (clash[0]) throw ApiError.conflict('slug_taken', `Plan "${body.slug}" already exists on this product`);

  const [plan] = await sql<Array<Record<string, unknown> & { id: string }>>`
    INSERT INTO plans (product_id, slug, name, description, is_public, sort_order, status)
    VALUES (${product.id}, ${body.slug}, ${body.name}, ${body.description ?? null},
            ${body.is_public}, ${body.sort_order}, ${body.status})
    RETURNING *`;

  await adminAudit(c, 'catalog.plan.create', 'plans', plan!.id, null, { product: product.slug, slug: body.slug });
  return c.json({ plan }, 201);
});

adminCatalogRoutes.patch('/plans/:planId', requireStepUp, zValidator('json', planSchema.partial()), async (c) => {
  const sql = c.get('sql');
  const rows = await sql<Array<Record<string, unknown> & { id: string; product_id: string; slug: string }>>`
    SELECT * FROM plans WHERE id = ${c.req.param('planId')} LIMIT 1`;
  const before = rows[0];
  if (!before) throw ApiError.notFound('Plan');
  const body = c.req.valid('json');

  if (body.slug && body.slug !== before.slug) {
    const clash = await sql<{ id: string }[]>`
      SELECT id FROM plans WHERE product_id = ${before.product_id} AND slug = ${body.slug} AND id <> ${before.id} LIMIT 1`;
    if (clash[0]) throw ApiError.conflict('slug_taken', `Plan "${body.slug}" already exists on this product`);
  }

  const [plan] = await sql<Array<Record<string, unknown>>>`
    UPDATE plans SET
      slug = ${body.slug ?? before.slug},
      name = ${body.name ?? (before.name as string)},
      description = ${body.description !== undefined ? body.description : (before.description as string | null)},
      is_public = ${body.is_public ?? (before.is_public as boolean)},
      sort_order = ${body.sort_order ?? (before.sort_order as number)},
      status = ${body.status ?? (before.status as string)}
    WHERE id = ${before.id} RETURNING *`;

  await adminAuditChange(c, 'catalog.plan.update', 'plans', before.id, null, before, body);
  await invalidateEveryOrgHoldingProduct(c, before.product_id);
  return c.json({ plan });
});

adminCatalogRoutes.delete('/plans/:planId', zValidator('json', destructiveSchema), async (c) => {
  const body = c.req.valid('json');
  await requireFreshMfa(c, body.mfa_code);
  const sql = c.get('sql');
  const rows = await sql<Array<{ id: string; product_id: string; slug: string }>>`
    SELECT id, product_id, slug FROM plans WHERE id = ${c.req.param('planId')} LIMIT 1`;
  const plan = rows[0];
  if (!plan) throw ApiError.notFound('Plan');

  const [usage] = await sql<Array<{ licenses: number; grants: number; sub_items: number; is_free_plan: number }>>`
    SELECT (SELECT COUNT(*)::int FROM licenses WHERE plan_id = ${plan.id}) AS licenses,
           (SELECT COUNT(*)::int FROM product_access_grants WHERE plan_id = ${plan.id}) AS grants,
           (SELECT COUNT(*)::int FROM subscription_items WHERE plan_id = ${plan.id}) AS sub_items,
           (SELECT COUNT(*)::int FROM products WHERE free_plan_id = ${plan.id}) AS is_free_plan`;
  if (usage!.licenses > 0 || usage!.grants > 0 || usage!.sub_items > 0) {
    throw ApiError.conflict(
      'plan_in_use',
      `Cannot delete: ${usage!.licenses} licenses, ${usage!.grants} grants, and ${usage!.sub_items} subscription items use this plan. Archive it instead (status = archived).`
    );
  }
  if (usage!.is_free_plan > 0) {
    throw ApiError.conflict('plan_is_free_plan', 'This plan is the product’s free plan — point free_plan_id elsewhere first');
  }

  await sql`DELETE FROM plans WHERE id = ${plan.id}`;
  await adminAudit(c, 'catalog.plan.delete', 'plans', plan.id, null, { reason: body.reason, slug: plan.slug });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

adminCatalogRoutes.post('/plans/:planId/prices', requireStepUp, zValidator('json', priceSchema), async (c) => {
  const sql = c.get('sql');
  const planId = c.req.param('planId');
  const plans = await sql<{ id: string }[]>`SELECT id FROM plans WHERE id = ${planId} LIMIT 1`;
  if (!plans[0]) throw ApiError.notFound('Plan');
  const body = c.req.valid('json');

  const price = await sql.begin(async (tx) => {
    // At most one default price per plan, or checkout has no deterministic pick.
    if (body.is_default) {
      await tx`UPDATE prices SET is_default = FALSE WHERE plan_id = ${planId}`;
    }
    const rows = await tx<Array<Record<string, unknown> & { id: string }>>`
      INSERT INTO prices (plan_id, stripe_price_id, amount, currency, "interval", trial_days, is_default, status)
      VALUES (${planId}, ${body.stripe_price_id ?? null}, ${body.amount}, ${body.currency.toUpperCase()},
              ${body.interval ?? null}, ${body.trial_days}, ${body.is_default}, ${body.status})
      RETURNING *`;
    return rows[0]!;
  });

  await adminAudit(c, 'catalog.price.create', 'prices', price.id, null, {
    plan_id: planId,
    amount: body.amount,
    interval: body.interval ?? 'one_time',
  });
  return c.json({ price }, 201);
});

adminCatalogRoutes.patch('/prices/:priceId', requireStepUp, zValidator('json', priceSchema.partial()), async (c) => {
  const sql = c.get('sql');
  const rows = await sql<Array<Record<string, unknown> & { id: string; plan_id: string }>>`
    SELECT * FROM prices WHERE id = ${c.req.param('priceId')} LIMIT 1`;
  const before = rows[0];
  if (!before) throw ApiError.notFound('Price');
  const body = c.req.valid('json');

  const price = await sql.begin(async (tx) => {
    if (body.is_default) {
      await tx`UPDATE prices SET is_default = FALSE WHERE plan_id = ${before.plan_id} AND id <> ${before.id}`;
    }
    const updated = await tx<Array<Record<string, unknown>>>`
      UPDATE prices SET
        amount = ${body.amount ?? (before.amount as number)},
        currency = ${(body.currency ?? (before.currency as string)).toUpperCase()},
        "interval" = ${body.interval !== undefined ? body.interval : (before.interval as string | null)},
        trial_days = ${body.trial_days ?? (before.trial_days as number)},
        is_default = ${body.is_default ?? (before.is_default as boolean)},
        status = ${body.status ?? (before.status as string)},
        stripe_price_id = ${body.stripe_price_id !== undefined ? body.stripe_price_id : (before.stripe_price_id as string | null)}
      WHERE id = ${before.id} RETURNING *`;
    return updated[0]!;
  });

  await adminAuditChange(c, 'catalog.price.update', 'prices', before.id, null, before, body);
  return c.json({ price });
});

adminCatalogRoutes.delete('/prices/:priceId', requireStepUp, async (c) => {
  const sql = c.get('sql');
  const rows = await sql<{ id: string; plan_id: string }[]>`
    SELECT id, plan_id FROM prices WHERE id = ${c.req.param('priceId')} LIMIT 1`;
  const price = rows[0];
  if (!price) throw ApiError.notFound('Price');

  const [used] = await sql<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count FROM subscription_items WHERE price_id = ${price.id}`;
  if (used!.count > 0) {
    throw ApiError.conflict(
      'price_in_use',
      `${used!.count} subscription items reference this price. Set status = archived instead of deleting.`
    );
  }

  await sql`DELETE FROM prices WHERE id = ${price.id}`;
  await adminAudit(c, 'catalog.price.delete', 'prices', price.id, null, { plan_id: price.plan_id });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Features + plan entitlements
// ---------------------------------------------------------------------------

adminCatalogRoutes.post('/products/:productId/features', requireStepUp, zValidator('json', featureSchema), async (c) => {
  const sql = c.get('sql');
  const product = await loadProduct(c, c.req.param('productId'));
  const body = c.req.valid('json');

  const clash = await sql<{ id: string }[]>`
    SELECT id FROM features WHERE product_id = ${product.id} AND key = ${body.key} LIMIT 1`;
  if (clash[0]) throw ApiError.conflict('key_taken', `Feature "${body.key}" already exists on this product`);

  const [feature] = await sql<Array<Record<string, unknown> & { id: string }>>`
    INSERT INTO features (product_id, key, name, description, type)
    VALUES (${product.id}, ${body.key}, ${body.name}, ${body.description ?? null}, ${body.type})
    RETURNING *`;

  await adminAudit(c, 'catalog.feature.create', 'features', feature!.id, null, {
    product: product.slug,
    key: body.key,
  });
  return c.json({ feature }, 201);
});

adminCatalogRoutes.patch('/features/:featureId', requireStepUp, zValidator('json', featureSchema.partial()), async (c) => {
  const sql = c.get('sql');
  const rows = await sql<Array<Record<string, unknown> & { id: string; product_id: string; key: string }>>`
    SELECT * FROM features WHERE id = ${c.req.param('featureId')} LIMIT 1`;
  const before = rows[0];
  if (!before) throw ApiError.notFound('Feature');
  const body = c.req.valid('json');

  if (body.key && body.key !== before.key) {
    const clash = await sql<{ id: string }[]>`
      SELECT id FROM features WHERE product_id = ${before.product_id} AND key = ${body.key} AND id <> ${before.id} LIMIT 1`;
    if (clash[0]) throw ApiError.conflict('key_taken', `Feature "${body.key}" already exists on this product`);
  }

  const [feature] = await sql<Array<Record<string, unknown>>>`
    UPDATE features SET
      key = ${body.key ?? before.key},
      name = ${body.name ?? (before.name as string)},
      description = ${body.description !== undefined ? body.description : (before.description as string | null)},
      type = ${body.type ?? (before.type as string)}
    WHERE id = ${before.id} RETURNING *`;

  await adminAuditChange(c, 'catalog.feature.update', 'features', before.id, null, before, body);
  await invalidateEveryOrgHoldingProduct(c, before.product_id);
  return c.json({ feature });
});

adminCatalogRoutes.delete('/features/:featureId', requireStepUp, async (c) => {
  const sql = c.get('sql');
  const rows = await sql<{ id: string; product_id: string; key: string }[]>`
    SELECT id, product_id, key FROM features WHERE id = ${c.req.param('featureId')} LIMIT 1`;
  const feature = rows[0];
  if (!feature) throw ApiError.notFound('Feature');

  // plan_entitlements cascade on delete, so this silently un-entitles plans.
  // Say so in the audit record rather than hiding it.
  const [entitled] = await sql<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count FROM plan_entitlements WHERE feature_id = ${feature.id}`;

  await sql`DELETE FROM features WHERE id = ${feature.id}`;
  await adminAudit(c, 'catalog.feature.delete', 'features', feature.id, null, {
    key: feature.key,
    removed_from_plans: entitled!.count,
  });
  await invalidateEveryOrgHoldingProduct(c, feature.product_id);
  return c.json({ ok: true, removed_from_plans: entitled!.count });
});

/**
 * Replace a plan's entitlement set wholesale. A plan's entitlements are edited
 * as one grid in the UI, and a full replace makes "I removed that row" work
 * without a separate delete call per feature.
 */
adminCatalogRoutes.put('/plans/:planId/entitlements', requireStepUp, zValidator('json', entitlementsSchema), async (c) => {
  const sql = c.get('sql');
  const planId = c.req.param('planId');
  const plans = await sql<{ id: string; product_id: string }[]>`
    SELECT id, product_id FROM plans WHERE id = ${planId} LIMIT 1`;
  const plan = plans[0];
  if (!plan) throw ApiError.notFound('Plan');
  const { entitlements } = c.req.valid('json');

  // Every feature must belong to this plan's product — otherwise a plan could
  // grant another product's capabilities.
  if (entitlements.length > 0) {
    const ids = entitlements.map((e) => e.feature_id);
    const owned = await sql<{ id: string }[]>`
      SELECT id FROM features WHERE product_id = ${plan.product_id} AND id IN ${sql(ids)}`;
    if (owned.length !== new Set(ids).size) {
      throw ApiError.badRequest('invalid_feature', 'Every feature must belong to this plan’s product');
    }
  }

  const before = await sql<Array<{ feature_id: string; value: unknown }>>`
    SELECT feature_id, value FROM plan_entitlements WHERE plan_id = ${planId}`;

  await sql.begin(async (tx) => {
    await tx`DELETE FROM plan_entitlements WHERE plan_id = ${planId}`;
    for (const entry of entitlements) {
      await tx`
        INSERT INTO plan_entitlements (plan_id, feature_id, value)
        VALUES (${planId}, ${entry.feature_id}, ${tx.json(entry.value as never)})`;
    }
  });

  await adminAudit(c, 'catalog.plan.entitlements.replace', 'plans', planId, null, {
    from: before,
    to: entitlements,
  });
  await invalidateEveryOrgHoldingProduct(c, plan.product_id);
  return c.json({ entitlements });
});
