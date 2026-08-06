/**
 * License management beyond the suspend/revoke lifecycle already in
 * `routes.ts` — issuing keys by hand, moving a license between plans
 * (upgrade / downgrade), changing seat counts, extending expiry, and
 * transferring ownership between organizations.
 *
 * The plan change is the interesting one. A license carries `plan_id`, and
 * entitlement resolution reads the plan's entitlements directly, so switching
 * plans is a single column write — but two things have to be reconciled
 * alongside it:
 *
 *  - **Seats.** `max_activations` normally derives from the plan's
 *    `<product>.sites.max` entitlement. On a downgrade the new seat count can
 *    be below the number of sites currently activated, so the caller must say
 *    what should happen: refuse, or deactivate the newest activations down to
 *    the new limit. Silently leaving a license over its limit would let a
 *    downgraded customer keep every site running.
 *  - **Cached entitlements.** Resolution is cached per org for 60s. Every
 *    mutation here drops that cache so the change is visible on the next
 *    plugin validation rather than up to a minute later.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppContext } from '../../env';
import { ApiError } from '../../errors';
import { getClientIp } from '../../middleware/correlation';
import { EntitlementService } from '../entitlements/service';
import { makeLicenseService } from '../licenses/routes';
import type { ActivationRow } from '../licenses/service';
import { adminAudit, actorOf, requireAdminRole, requireFreshMfa, requireStepUp } from './guards';

export const adminLicensingRoutes = new Hono<AppContext>();

// Licensing decisions are commercial, so billing_admin qualifies alongside the
// platform tiers — but support_agent does not.
adminLicensingRoutes.use('*', requireAdminRole('billing_admin', 'platform_admin', 'super_admin'));

/** Seats the plan itself implies, if it declares a `<product>.sites.max`. */
async function planSeatLimit(
  sql: AppContext['Variables']['sql'],
  planId: string,
  productSlug: string
): Promise<number | null> {
  const rows = await sql<{ value: number }[]>`
    SELECT pe.value::int AS value
    FROM plan_entitlements pe
    JOIN features f ON f.id = pe.feature_id
    WHERE pe.plan_id = ${planId} AND f.key = ${`${productSlug}.sites.max`}
    LIMIT 1`;
  return rows[0]?.value ?? null;
}

// ---------------------------------------------------------------------------
// Issue a license directly
// ---------------------------------------------------------------------------

adminLicensingRoutes.post(
  '/',
  requireStepUp,
  zValidator(
    'json',
    z.object({
      organization_id: z.string().uuid(),
      product_slug: z.string().min(1),
      plan_slug: z.string().min(1),
      max_activations: z.number().int().min(1).max(10_000).optional(),
      expires_at: z.string().datetime().nullish(),
      reason: z.string().min(3).max(500),
    })
  ),
  async (c) => {
    const sql = c.get('sql');
    const body = c.req.valid('json');

    const orgs = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE id = ${body.organization_id} LIMIT 1`;
    if (!orgs[0]) throw ApiError.notFound('Organization');

    const targets = await sql<Array<{ product_id: string; plan_id: string; product_type: string }>>`
      SELECT p.id AS product_id, pl.id AS plan_id, p.type AS product_type
      FROM products p JOIN plans pl ON pl.product_id = p.id
      WHERE p.slug = ${body.product_slug} AND pl.slug = ${body.plan_slug} LIMIT 1`;
    const target = targets[0];
    if (!target) throw ApiError.notFound(`Plan "${body.plan_slug}" on product "${body.product_slug}"`);

    const issued = await makeLicenseService(c).issue({
      organizationId: body.organization_id,
      productId: target.product_id,
      planId: target.plan_id,
      maxActivations: body.max_activations,
      expiresAt: body.expires_at ? new Date(body.expires_at) : null,
    });

    await adminAudit(c, 'license.issue', 'licenses', issued.licenseId, body.organization_id, {
      product: body.product_slug,
      plan: body.plan_slug,
      reason: body.reason,
    });
    await new EntitlementService(sql, c.env.SESSION_CACHE).invalidate(body.organization_id);

    // The raw key is shown exactly once — only the hash is stored.
    return c.json({ license_id: issued.licenseId, license_key: issued.rawKey, key_mask: issued.mask }, 201);
  }
);

// ---------------------------------------------------------------------------
// Upgrade / downgrade
// ---------------------------------------------------------------------------

adminLicensingRoutes.post(
  '/:licenseId/change-plan',
  requireStepUp,
  zValidator(
    'json',
    z.object({
      plan_slug: z.string().min(1),
      /** Omit to take the new plan's `<product>.sites.max`, or keep the current count if it declares none. */
      max_activations: z.number().int().min(1).max(10_000).optional(),
      expires_at: z.string().datetime().nullish(),
      /**
       * What to do when the new seat limit is below the number of sites live
       * today. `refuse` (default) fails loudly; `deactivate_newest` frees the
       * most recently activated sites until the license fits.
       */
      over_limit: z.enum(['refuse', 'deactivate_newest']).default('refuse'),
      reason: z.string().min(3).max(500),
    })
  ),
  async (c) => {
    const sql = c.get('sql');
    const licenseId = c.req.param('licenseId');
    const body = c.req.valid('json');
    const licenses = makeLicenseService(c);

    const license = await licenses.loadById(licenseId);
    if (!license) throw ApiError.notFound('License');

    const plans = await sql<Array<{ id: string; slug: string }>>`
      SELECT id, slug FROM plans
      WHERE product_id = ${license.product_id} AND slug = ${body.plan_slug} AND status = 'active' LIMIT 1`;
    const newPlan = plans[0];
    if (!newPlan) {
      throw ApiError.badRequest(
        'invalid_plan',
        `"${body.plan_slug}" is not an active plan of ${license.product_slug} — a license cannot move between products`
      );
    }
    if (newPlan.id === license.plan_id) {
      throw ApiError.conflict('same_plan', 'This license is already on that plan');
    }

    const derivedSeats = await planSeatLimit(sql, newPlan.id, license.product_slug);
    const newSeats = body.max_activations ?? derivedSeats ?? license.max_activations;

    const activeRows = await sql<ActivationRow[]>`
      SELECT id, license_id, organization_id, website_id, domain_normalized, installation_uuid,
             environment, status, token_hash
      FROM license_activations
      WHERE license_id = ${licenseId} AND status = 'active' AND environment = 'production'
      ORDER BY first_activated_at DESC`;

    let deactivated: string[] = [];
    if (activeRows.length > newSeats) {
      if (body.over_limit === 'refuse') {
        throw ApiError.conflict(
          'over_seat_limit',
          `${activeRows.length} production sites are active but "${body.plan_slug}" allows ${newSeats}. Re-send with over_limit="deactivate_newest" to free the newest ${activeRows.length - newSeats}.`
        );
      }
      // Newest-first ordering above means the slice is the most recent ones,
      // which are the least likely to be the customer's primary site.
      const excess = activeRows.slice(0, activeRows.length - newSeats);
      for (const activation of excess) {
        await licenses.deactivateById(activation, `admin_downgrade:${body.reason}`, getClientIp(c), actorOf(c));
      }
      deactivated = excess.map((a) => a.domain_normalized);
    }

    const [updated] = await sql<Array<{ id: string; plan_id: string; max_activations: number; expires_at: string | null }>>`
      UPDATE licenses SET
        plan_id = ${newPlan.id},
        max_activations = ${newSeats},
        expires_at = ${body.expires_at !== undefined ? body.expires_at : license.expires_at},
        grace_period_ends_at = NULL
      WHERE id = ${licenseId}
      RETURNING id, plan_id, max_activations, expires_at`;

    await licenses.logEvent(sql, {
      licenseId,
      organizationId: license.organization_id,
      eventType: 'plan_changed',
      actor: actorOf(c),
      ip: getClientIp(c),
      meta: {
        from_plan: license.plan_slug,
        to_plan: newPlan.slug,
        from_seats: license.max_activations,
        to_seats: newSeats,
        deactivated_domains: deactivated,
        reason: body.reason,
      },
    });
    await adminAudit(c, 'license.change_plan', 'licenses', licenseId, license.organization_id, {
      from_plan: license.plan_slug,
      to_plan: newPlan.slug,
      from_seats: license.max_activations,
      to_seats: newSeats,
      deactivated_domains: deactivated,
      reason: body.reason,
    });
    await new EntitlementService(sql, c.env.SESSION_CACHE).invalidate(license.organization_id);

    return c.json({
      license: updated,
      previous_plan: license.plan_slug,
      new_plan: newPlan.slug,
      deactivated_domains: deactivated,
    });
  }
);

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

adminLicensingRoutes.post(
  '/:licenseId/extend',
  requireStepUp,
  zValidator(
    'json',
    z
      .object({
        /** Absolute new expiry, or null for a perpetual license. */
        expires_at: z.string().datetime().nullish(),
        /** Relative alternative — added to the later of now and the current expiry. */
        add_days: z.number().int().min(1).max(3650).optional(),
        reason: z.string().min(3).max(500),
      })
      .refine((v) => v.expires_at !== undefined || v.add_days !== undefined, {
        message: 'Provide either expires_at or add_days',
      })
  ),
  async (c) => {
    const sql = c.get('sql');
    const licenseId = c.req.param('licenseId');
    const body = c.req.valid('json');
    const licenses = makeLicenseService(c);

    const license = await licenses.loadById(licenseId);
    if (!license) throw ApiError.notFound('License');

    let nextExpiry: Date | null;
    if (body.add_days !== undefined) {
      // Extending an already-expired license should add days from today, not
      // from a date in the past that would leave it still expired.
      const current = license.expires_at ? new Date(license.expires_at) : null;
      const base = current && current.getTime() > Date.now() ? current : new Date();
      nextExpiry = new Date(base.getTime() + body.add_days * 86400 * 1000);
    } else {
      nextExpiry = body.expires_at ? new Date(body.expires_at) : null;
    }

    // Clearing the pinned grace deadline matters: without it a license that
    // already entered grace would keep its old deadline and expire again.
    const [updated] = await sql<Array<{ id: string; expires_at: string | null }>>`
      UPDATE licenses SET expires_at = ${nextExpiry}, grace_period_ends_at = NULL,
                          status = CASE WHEN status = 'expired' THEN 'active' ELSE status END
      WHERE id = ${licenseId} RETURNING id, expires_at`;

    await licenses.logEvent(sql, {
      licenseId,
      organizationId: license.organization_id,
      eventType: 'expiry_changed',
      actor: actorOf(c),
      ip: getClientIp(c),
      meta: { from: license.expires_at, to: nextExpiry?.toISOString() ?? null, reason: body.reason },
    });
    await adminAudit(c, 'license.extend', 'licenses', licenseId, license.organization_id, {
      from: license.expires_at,
      to: nextExpiry?.toISOString() ?? null,
      reason: body.reason,
    });
    await new EntitlementService(sql, c.env.SESSION_CACHE).invalidate(license.organization_id);
    return c.json({ license: updated });
  }
);

// ---------------------------------------------------------------------------
// Seats only (no plan change)
// ---------------------------------------------------------------------------

adminLicensingRoutes.post(
  '/:licenseId/seats',
  requireStepUp,
  zValidator(
    'json',
    z.object({
      max_activations: z.number().int().min(1).max(10_000),
      over_limit: z.enum(['refuse', 'deactivate_newest']).default('refuse'),
      reason: z.string().min(3).max(500),
    })
  ),
  async (c) => {
    const sql = c.get('sql');
    const licenseId = c.req.param('licenseId');
    const body = c.req.valid('json');
    const licenses = makeLicenseService(c);

    const license = await licenses.loadById(licenseId);
    if (!license) throw ApiError.notFound('License');

    const activeRows = await sql<ActivationRow[]>`
      SELECT id, license_id, organization_id, website_id, domain_normalized, installation_uuid,
             environment, status, token_hash
      FROM license_activations
      WHERE license_id = ${licenseId} AND status = 'active' AND environment = 'production'
      ORDER BY first_activated_at DESC`;

    let deactivated: string[] = [];
    if (activeRows.length > body.max_activations) {
      if (body.over_limit === 'refuse') {
        throw ApiError.conflict(
          'over_seat_limit',
          `${activeRows.length} production sites are active but you asked for ${body.max_activations}. Re-send with over_limit="deactivate_newest" to free the newest ${activeRows.length - body.max_activations}.`
        );
      }
      const excess = activeRows.slice(0, activeRows.length - body.max_activations);
      for (const activation of excess) {
        await licenses.deactivateById(activation, `admin_seat_reduction:${body.reason}`, getClientIp(c), actorOf(c));
      }
      deactivated = excess.map((a) => a.domain_normalized);
    }

    await sql`UPDATE licenses SET max_activations = ${body.max_activations} WHERE id = ${licenseId}`;
    await licenses.logEvent(sql, {
      licenseId,
      organizationId: license.organization_id,
      eventType: 'seats_changed',
      actor: actorOf(c),
      ip: getClientIp(c),
      meta: { from: license.max_activations, to: body.max_activations, deactivated_domains: deactivated, reason: body.reason },
    });
    await adminAudit(c, 'license.seats', 'licenses', licenseId, license.organization_id, {
      from: license.max_activations,
      to: body.max_activations,
      deactivated_domains: deactivated,
      reason: body.reason,
    });
    return c.json({ max_activations: body.max_activations, deactivated_domains: deactivated });
  }
);

// ---------------------------------------------------------------------------
// Transfer between organizations
// ---------------------------------------------------------------------------

/**
 * Moving a license to another organization takes every activation with it, so
 * the sites keep working — but the activation tokens embed the old `org_id`
 * and would fail their claim cross-check on the next validate. They are
 * revoked here so each site re-activates cleanly against the new owner.
 */
adminLicensingRoutes.post(
  '/:licenseId/transfer',
  zValidator(
    'json',
    z.object({
      organization_id: z.string().uuid(),
      reason: z.string().min(3).max(500),
      mfa_code: z.string().min(6).max(10),
    })
  ),
  async (c) => {
    const body = c.req.valid('json');
    await requireFreshMfa(c, body.mfa_code);
    const sql = c.get('sql');
    const licenseId = c.req.param('licenseId');
    const licenses = makeLicenseService(c);

    const license = await licenses.loadById(licenseId);
    if (!license) throw ApiError.notFound('License');
    if (license.organization_id === body.organization_id) {
      throw ApiError.conflict('same_organization', 'This license already belongs to that organization');
    }

    const orgs = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM organizations WHERE id = ${body.organization_id} LIMIT 1`;
    const destination = orgs[0];
    if (!destination) throw ApiError.notFound('Destination organization');

    const activations = await sql<ActivationRow[]>`
      SELECT id, license_id, organization_id, website_id, domain_normalized, installation_uuid,
             environment, status, token_hash
      FROM license_activations WHERE license_id = ${licenseId} AND status = 'active'`;

    await sql.begin(async (tx) => {
      await tx`UPDATE licenses SET organization_id = ${body.organization_id} WHERE id = ${licenseId}`;
      await tx`
        UPDATE license_activations SET organization_id = ${body.organization_id}, website_id = NULL
        WHERE license_id = ${licenseId}`;
    });

    // Old tokens carry the previous org_id and would be rejected by
    // resolveActivationToken; block them explicitly so the failure is a clean
    // "reactivate" rather than a confusing forbidden.
    for (const activation of activations) {
      if (activation.token_hash) {
        await c.env.SESSION_CACHE.put(`revoked_token:${activation.token_hash}`, 'true', { expirationTtl: 90 * 86400 });
      }
    }

    await licenses.logEvent(sql, {
      licenseId,
      organizationId: body.organization_id,
      eventType: 'transferred',
      actor: actorOf(c),
      ip: getClientIp(c),
      meta: { from_org: license.organization_id, to_org: body.organization_id, reason: body.reason },
    });
    await adminAudit(c, 'license.transfer', 'licenses', licenseId, body.organization_id, {
      from_org: license.organization_id,
      to_org: body.organization_id,
      reactivations_required: activations.length,
      reason: body.reason,
    });

    const entitlements = new EntitlementService(sql, c.env.SESSION_CACHE);
    await entitlements.invalidate(license.organization_id);
    await entitlements.invalidate(body.organization_id);

    return c.json({
      ok: true,
      organization: destination,
      reactivations_required: activations.length,
    });
  }
);
