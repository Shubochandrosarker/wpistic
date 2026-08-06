/**
 * Tenancy management — organizations, their members, their access grants, and
 * the user accounts behind them.
 *
 * Access grants are the important surface here. `product_access_grants` is
 * what actually entitles an organization to a product outside of a paid
 * subscription, so "upgrade this org to the pro plan of Insightistic" is a
 * grant plan change, not a billing operation. Changing a grant's plan takes
 * effect on the next entitlement resolution, which is why every mutation here
 * drops the org's cached resolution before returning.
 *
 * Suspension is deliberately reversible everywhere: suspending an org or a
 * user flips a status column and revokes sessions, but never deletes data.
 * Hard deletion of a customer is not exposed — it belongs in a separate,
 * deliberately awkward data-retention process, not a dashboard button.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import type { AppContext } from '../../env';
import { ApiError } from '../../errors';
import { EntitlementService } from '../entitlements/service';
import { randomHex, sha256Hex } from '../../utils/crypto';
import { adminAudit, adminAuditChange, requireAdminRole, requireFreshMfa, requireStepUp } from './guards';

const ORG_ROLE = z.enum(['owner', 'admin', 'billing_manager', 'product_manager', 'support_manager', 'member', 'viewer']);
const SLUG = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and single hyphens');

const destructiveSchema = z.object({
  reason: z.string().min(3).max(500),
  mfa_code: z.string().min(6).max(10),
});

async function invalidateOrg(c: Context<AppContext>, orgId: string): Promise<void> {
  await new EntitlementService(c.get('sql'), c.env.SESSION_CACHE).invalidate(orgId);
}

export const adminTenancyRoutes = new Hono<AppContext>();
adminTenancyRoutes.use('*', requireAdminRole('platform_admin', 'super_admin'));

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

const orgCreateSchema = z.object({
  name: z.string().min(1).max(255),
  slug: SLUG,
  billing_email: z.string().email().max(255).nullish(),
  owner_email: z.string().email().max(255),
  metadata: z.record(z.unknown()).default({}),
});

const orgUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: SLUG.optional(),
  billing_email: z.string().email().max(255).nullish(),
  tax_id: z.string().max(50).nullish(),
  metadata: z.record(z.unknown()).optional(),
});

adminTenancyRoutes.post('/organizations', requireStepUp, zValidator('json', orgCreateSchema), async (c) => {
  const sql = c.get('sql');
  const body = c.req.valid('json');

  const owners = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE lower(email) = ${body.owner_email.toLowerCase()} LIMIT 1`;
  const owner = owners[0];
  if (!owner) throw ApiError.badRequest('unknown_owner', `No user account exists for ${body.owner_email}`);

  const clash = await sql<{ id: string }[]>`SELECT id FROM organizations WHERE slug = ${body.slug} LIMIT 1`;
  if (clash[0]) throw ApiError.conflict('slug_taken', `An organization with slug "${body.slug}" already exists`);

  const org = await sql.begin(async (tx) => {
    const rows = await tx<Array<Record<string, unknown> & { id: string }>>`
      INSERT INTO organizations (name, slug, billing_email, metadata)
      VALUES (${body.name}, ${body.slug}, ${body.billing_email ?? body.owner_email},
              ${tx.json(body.metadata as never)})
      RETURNING *`;
    const created = rows[0]!;
    await tx`
      INSERT INTO organization_memberships (user_id, organization_id, role, status)
      VALUES (${owner.id}, ${created.id}, 'owner', 'active')`;
    return created;
  });

  await adminAudit(c, 'organization.create', 'organizations', org.id, org.id, {
    slug: body.slug,
    owner_email: body.owner_email,
  });
  return c.json({ organization: org }, 201);
});

adminTenancyRoutes.patch('/organizations/:orgId', requireStepUp, zValidator('json', orgUpdateSchema), async (c) => {
  const sql = c.get('sql');
  const rows = await sql<Array<Record<string, unknown> & { id: string; slug: string }>>`
    SELECT * FROM organizations WHERE id = ${c.req.param('orgId')} LIMIT 1`;
  const before = rows[0];
  if (!before) throw ApiError.notFound('Organization');
  const body = c.req.valid('json');

  if (body.slug && body.slug !== before.slug) {
    const clash = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = ${body.slug} AND id <> ${before.id} LIMIT 1`;
    if (clash[0]) throw ApiError.conflict('slug_taken', `An organization with slug "${body.slug}" already exists`);
  }

  const [organization] = await sql<Array<Record<string, unknown>>>`
    UPDATE organizations SET
      name = ${body.name ?? (before.name as string)},
      slug = ${body.slug ?? before.slug},
      billing_email = ${body.billing_email !== undefined ? body.billing_email : (before.billing_email as string | null)},
      tax_id = ${body.tax_id !== undefined ? body.tax_id : (before.tax_id as string | null)},
      metadata = ${sql.json((body.metadata ?? before.metadata) as never)}
    WHERE id = ${before.id} RETURNING *`;

  await adminAuditChange(c, 'organization.update', 'organizations', before.id, before.id, before, body);
  return c.json({ organization });
});

/**
 * Suspending an organization stops its people getting in without touching
 * their data or their licenses. Plugin validation is unaffected on purpose —
 * cutting off a paying customer's production sites is a licence action, taken
 * per licence, not a side effect of an account dispute.
 */
adminTenancyRoutes.post(
  '/organizations/:orgId/status',
  zValidator('json', destructiveSchema.extend({ status: z.enum(['active', 'suspended', 'closed']) })),
  async (c) => {
    const body = c.req.valid('json');
    await requireFreshMfa(c, body.mfa_code);
    const sql = c.get('sql');
    const orgId = c.req.param('orgId');

    const rows = await sql<{ id: string; status: string; name: string }[]>`
      SELECT id, status, name FROM organizations WHERE id = ${orgId} LIMIT 1`;
    const before = rows[0];
    if (!before) throw ApiError.notFound('Organization');

    await sql`UPDATE organizations SET status = ${body.status} WHERE id = ${orgId}`;
    if (body.status !== 'active') {
      // Revoke every session belonging to a member of this org so the change
      // takes effect immediately rather than at token expiry.
      await sql`
        UPDATE sessions SET revoked_at = NOW()
        WHERE revoked_at IS NULL AND user_id IN (
          SELECT user_id FROM organization_memberships WHERE organization_id = ${orgId}
        )`;
    }

    await adminAudit(c, `organization.${body.status}`, 'organizations', orgId, orgId, {
      reason: body.reason,
      previous_status: before.status,
    });
    await invalidateOrg(c, orgId);
    return c.json({ ok: true, status: body.status });
  }
);

// ---------------------------------------------------------------------------
// Access grants — the upgrade/downgrade surface for non-paid product access
// ---------------------------------------------------------------------------

const grantCreateSchema = z.object({
  product_slug: z.string().min(1),
  plan_slug: z.string().min(1),
  source: z.enum(['manual', 'promotion', 'migration', 'bundle']).default('manual'),
  limit_overrides: z.record(z.unknown()).default({}),
  ends_at: z.string().datetime().nullish(),
  reason: z.string().min(3).max(500),
});

adminTenancyRoutes.get('/organizations/:orgId/grants', async (c) => {
  const grants = await c.get('sql')`
    SELECT g.id, g.source, g.source_reference, g.status, g.starts_at, g.ends_at, g.limit_overrides,
           g.reason, g.created_at, g.updated_at,
           p.id AS product_id, p.slug AS product, p.name AS product_name, p.free_limits,
           pl.id AS plan_id, pl.slug AS plan, pl.name AS plan_name
    FROM product_access_grants g
    JOIN products p ON p.id = g.product_id
    JOIN plans pl ON pl.id = g.plan_id
    WHERE g.organization_id = ${c.req.param('orgId')}
    ORDER BY g.created_at DESC`;
  return c.json({ grants });
});

adminTenancyRoutes.post(
  '/organizations/:orgId/grants',
  requireStepUp,
  zValidator('json', grantCreateSchema),
  async (c) => {
    const sql = c.get('sql');
    const orgId = c.req.param('orgId');
    const body = c.req.valid('json');
    const admin = c.get('user');

    const orgs = await sql<{ id: string }[]>`SELECT id FROM organizations WHERE id = ${orgId} LIMIT 1`;
    if (!orgs[0]) throw ApiError.notFound('Organization');

    const targets = await sql<Array<{ product_id: string; plan_id: string }>>`
      SELECT p.id AS product_id, pl.id AS plan_id
      FROM products p JOIN plans pl ON pl.product_id = p.id
      WHERE p.slug = ${body.product_slug} AND pl.slug = ${body.plan_slug} LIMIT 1`;
    const target = targets[0];
    if (!target) throw ApiError.notFound(`Plan "${body.plan_slug}" on product "${body.product_slug}"`);

    // The partial unique index only covers source='free_claim', so a manual
    // grant would otherwise be duplicable. Enforce one active grant per
    // org+product regardless of source.
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM product_access_grants
      WHERE organization_id = ${orgId} AND product_id = ${target.product_id} AND status = 'active' LIMIT 1`;
    if (existing[0]) {
      throw ApiError.conflict(
        'grant_exists',
        'This organization already has active access to that product — change the existing grant’s plan instead'
      );
    }

    const [grant] = await sql<Array<Record<string, unknown> & { id: string }>>`
      INSERT INTO product_access_grants
        (organization_id, product_id, plan_id, source, source_reference, limit_overrides,
         idempotency_key, created_by, reason, ends_at)
      VALUES (${orgId}, ${target.product_id}, ${target.plan_id}, ${body.source},
              ${`admin:${body.product_slug}:${body.plan_slug}`}, ${sql.json(body.limit_overrides as never)},
              ${`admin-${randomHex(12)}`}, ${admin?.id ?? null}, ${body.reason}, ${body.ends_at ?? null})
      RETURNING *`;

    await adminAudit(c, 'organization.grant.create', 'product_access_grants', grant!.id, orgId, {
      product: body.product_slug,
      plan: body.plan_slug,
      reason: body.reason,
    });
    await invalidateOrg(c, orgId);
    return c.json({ grant }, 201);
  }
);

/**
 * Upgrade / downgrade. Moving a grant to a different plan of the same product
 * is the whole operation — entitlements re-resolve from the new plan on the
 * next request. Moving it to a *different product's* plan is refused, because
 * that would silently entitle a product the grant does not name.
 */
adminTenancyRoutes.patch(
  '/organizations/:orgId/grants/:grantId',
  requireStepUp,
  zValidator(
    'json',
    z.object({
      plan_slug: z.string().min(1).optional(),
      limit_overrides: z.record(z.unknown()).optional(),
      status: z.enum(['active', 'suspended', 'revoked', 'expired']).optional(),
      ends_at: z.string().datetime().nullish(),
      reason: z.string().min(3).max(500),
    })
  ),
  async (c) => {
    const sql = c.get('sql');
    const orgId = c.req.param('orgId');
    const body = c.req.valid('json');

    const rows = await sql<
      Array<Record<string, unknown> & { id: string; product_id: string; plan_id: string; status: string }>
    >`
      SELECT * FROM product_access_grants
      WHERE id = ${c.req.param('grantId')} AND organization_id = ${orgId} LIMIT 1`;
    const before = rows[0];
    if (!before) throw ApiError.notFound('Access grant');

    let planId = before.plan_id;
    if (body.plan_slug) {
      const plans = await sql<{ id: string }[]>`
        SELECT id FROM plans WHERE product_id = ${before.product_id} AND slug = ${body.plan_slug} LIMIT 1`;
      if (!plans[0]) {
        throw ApiError.badRequest('invalid_plan', `"${body.plan_slug}" is not a plan of this grant’s product`);
      }
      planId = plans[0].id;
    }

    const [grant] = await sql<Array<Record<string, unknown>>>`
      UPDATE product_access_grants SET
        plan_id = ${planId},
        limit_overrides = ${sql.json((body.limit_overrides ?? before.limit_overrides) as never)},
        status = ${body.status ?? before.status},
        ends_at = ${body.ends_at !== undefined ? body.ends_at : (before.ends_at as string | null)},
        reason = ${body.reason},
        revoked_by = ${body.status === 'revoked' ? (c.get('user')?.id ?? null) : (before.revoked_by as string | null)},
        updated_at = NOW()
      WHERE id = ${before.id} RETURNING *`;

    await adminAuditChange(c, 'organization.grant.update', 'product_access_grants', before.id, orgId, before, {
      plan_id: planId,
      status: body.status ?? before.status,
      limit_overrides: body.limit_overrides ?? before.limit_overrides,
      reason: body.reason,
    });
    await invalidateOrg(c, orgId);
    return c.json({ grant });
  }
);

adminTenancyRoutes.delete(
  '/organizations/:orgId/grants/:grantId',
  zValidator('json', destructiveSchema),
  async (c) => {
    const body = c.req.valid('json');
    await requireFreshMfa(c, body.mfa_code);
    const sql = c.get('sql');
    const orgId = c.req.param('orgId');

    const rows = await sql<{ id: string; product_id: string }[]>`
      SELECT id, product_id FROM product_access_grants
      WHERE id = ${c.req.param('grantId')} AND organization_id = ${orgId} LIMIT 1`;
    const grant = rows[0];
    if (!grant) throw ApiError.notFound('Access grant');

    // Revoke rather than delete: the row is the record of what the customer
    // was given and when it stopped.
    await sql`
      UPDATE product_access_grants
      SET status = 'revoked', revoked_by = ${c.get('user')?.id ?? null}, reason = ${body.reason}, updated_at = NOW()
      WHERE id = ${grant.id}`;

    await adminAudit(c, 'organization.grant.revoke', 'product_access_grants', grant.id, orgId, {
      reason: body.reason,
    });
    await invalidateOrg(c, orgId);
    return c.json({ ok: true });
  }
);

// ---------------------------------------------------------------------------
// Organization members
// ---------------------------------------------------------------------------

adminTenancyRoutes.post(
  '/organizations/:orgId/members',
  requireStepUp,
  zValidator('json', z.object({ email: z.string().email(), role: ORG_ROLE.default('member'), reason: z.string().min(3).max(500) })),
  async (c) => {
    const sql = c.get('sql');
    const orgId = c.req.param('orgId');
    const body = c.req.valid('json');

    const users = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE lower(email) = ${body.email.toLowerCase()} LIMIT 1`;
    const user = users[0];
    if (!user) throw ApiError.badRequest('unknown_user', `No user account exists for ${body.email}`);

    const [membership] = await sql<Array<Record<string, unknown> & { id: string }>>`
      INSERT INTO organization_memberships (user_id, organization_id, role, status)
      VALUES (${user.id}, ${orgId}, ${body.role}, 'active')
      ON CONFLICT (user_id, organization_id)
      DO UPDATE SET role = ${body.role}, status = 'active'
      RETURNING *`;

    await adminAudit(c, 'organization.member.add', 'organization_memberships', membership!.id, orgId, {
      email: body.email,
      role: body.role,
      reason: body.reason,
    });
    // Membership drives tenant resolution, which is cached for 60s per pair.
    await c.env.SESSION_CACHE.delete(`member:${user.id}:${orgId}`);
    return c.json({ membership }, 201);
  }
);

adminTenancyRoutes.patch(
  '/organizations/:orgId/members/:membershipId',
  requireStepUp,
  zValidator(
    'json',
    z.object({
      role: ORG_ROLE.optional(),
      status: z.enum(['active', 'suspended']).optional(),
      reason: z.string().min(3).max(500),
    })
  ),
  async (c) => {
    const sql = c.get('sql');
    const orgId = c.req.param('orgId');
    const body = c.req.valid('json');

    const rows = await sql<Array<Record<string, unknown> & { id: string; user_id: string; role: string; status: string }>>`
      SELECT * FROM organization_memberships
      WHERE id = ${c.req.param('membershipId')} AND organization_id = ${orgId} LIMIT 1`;
    const before = rows[0];
    if (!before) throw ApiError.notFound('Membership');

    // An organization with no active owner has nobody who can administer it,
    // and support would have to re-seat one by hand.
    const losingOwner =
      before.role === 'owner' && ((body.role && body.role !== 'owner') || body.status === 'suspended');
    if (losingOwner) {
      const [remaining] = await sql<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM organization_memberships
        WHERE organization_id = ${orgId} AND role = 'owner' AND status = 'active' AND id <> ${before.id}`;
      if (remaining!.count === 0) {
        throw ApiError.conflict('last_owner', 'Promote another member to owner before changing this one');
      }
    }

    const [membership] = await sql<Array<Record<string, unknown>>>`
      UPDATE organization_memberships
      SET role = ${body.role ?? before.role}, status = ${body.status ?? before.status}
      WHERE id = ${before.id} RETURNING *`;

    await adminAuditChange(c, 'organization.member.update', 'organization_memberships', before.id, orgId, before, {
      role: body.role ?? before.role,
      status: body.status ?? before.status,
      reason: body.reason,
    });
    await c.env.SESSION_CACHE.delete(`member:${before.user_id}:${orgId}`);
    return c.json({ membership });
  }
);

adminTenancyRoutes.delete(
  '/organizations/:orgId/members/:membershipId',
  zValidator('json', destructiveSchema),
  async (c) => {
    const body = c.req.valid('json');
    await requireFreshMfa(c, body.mfa_code);
    const sql = c.get('sql');
    const orgId = c.req.param('orgId');

    const rows = await sql<{ id: string; user_id: string; role: string }[]>`
      SELECT id, user_id, role FROM organization_memberships
      WHERE id = ${c.req.param('membershipId')} AND organization_id = ${orgId} LIMIT 1`;
    const membership = rows[0];
    if (!membership) throw ApiError.notFound('Membership');

    if (membership.role === 'owner') {
      const [remaining] = await sql<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM organization_memberships
        WHERE organization_id = ${orgId} AND role = 'owner' AND status = 'active' AND id <> ${membership.id}`;
      if (remaining!.count === 0) {
        throw ApiError.conflict('last_owner', 'Promote another member to owner before removing this one');
      }
    }

    await sql`DELETE FROM organization_memberships WHERE id = ${membership.id}`;
    await adminAudit(c, 'organization.member.remove', 'organization_memberships', membership.id, orgId, {
      reason: body.reason,
    });
    await c.env.SESSION_CACHE.delete(`member:${membership.user_id}:${orgId}`);
    return c.json({ ok: true });
  }
);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

adminTenancyRoutes.get('/users', async (c) => {
  const query = (c.req.query('query') ?? '').trim();
  const status = c.req.query('status') ?? '';
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 200);
  const offset = parseInt(c.req.query('offset') ?? '0', 10) || 0;
  const like = `%${query}%`;

  const users = await c.get('sql')`
    SELECT u.id, u.email, u.first_name, u.last_name, u.status, u.mfa_enabled, u.email_verified_at,
           u.last_login_at, u.login_count, u.created_at,
           (SELECT COUNT(*)::int FROM organization_memberships m
             WHERE m.user_id = u.id AND m.status = 'active') AS organization_count
    FROM users u
    WHERE (${query} = '' OR u.email ILIKE ${like} OR u.first_name ILIKE ${like} OR u.last_name ILIKE ${like})
      AND (${status} = '' OR u.status = ${status})
    ORDER BY u.created_at DESC
    LIMIT ${limit} OFFSET ${offset}`;
  return c.json({ users });
});

adminTenancyRoutes.get('/users/:userId', async (c) => {
  const sql = c.get('sql');
  const userId = c.req.param('userId');
  const users = await sql<Array<Record<string, unknown>>>`
    SELECT id, email, first_name, last_name, avatar_url, status, mfa_enabled, email_verified_at,
           last_login_at, login_count, created_at, updated_at
    FROM users WHERE id = ${userId} LIMIT 1`;
  if (!users[0]) throw ApiError.notFound('User');

  const [organizations, sessions, security] = await Promise.all([
    sql`SELECT m.id AS membership_id, m.role, m.status, o.id, o.name, o.slug
        FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
        WHERE m.user_id = ${userId} ORDER BY m.created_at`,
    sql`SELECT id, ip_address::text AS ip_address, user_agent, created_at, expires_at, revoked_at
        FROM sessions WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 20`,
    sql`SELECT event_type, severity, ip_address::text AS ip_address, created_at
        FROM security_events WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 25`,
  ]);

  return c.json({ user: users[0], organizations, sessions, security_events: security });
});

adminTenancyRoutes.patch(
  '/users/:userId',
  requireStepUp,
  zValidator(
    'json',
    z.object({
      first_name: z.string().max(100).nullish(),
      last_name: z.string().max(100).nullish(),
      email: z.string().email().max(255).optional(),
      reason: z.string().min(3).max(500),
    })
  ),
  async (c) => {
    const sql = c.get('sql');
    const rows = await sql<Array<Record<string, unknown> & { id: string; email: string }>>`
      SELECT * FROM users WHERE id = ${c.req.param('userId')} LIMIT 1`;
    const before = rows[0];
    if (!before) throw ApiError.notFound('User');
    const body = c.req.valid('json');

    if (body.email && body.email.toLowerCase() !== before.email.toLowerCase()) {
      const clash = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE lower(email) = ${body.email.toLowerCase()} AND id <> ${before.id} LIMIT 1`;
      if (clash[0]) throw ApiError.conflict('email_taken', 'Another account already uses that email address');
    }

    const [user] = await sql<Array<Record<string, unknown>>>`
      UPDATE users SET
        first_name = ${body.first_name !== undefined ? body.first_name : (before.first_name as string | null)},
        last_name = ${body.last_name !== undefined ? body.last_name : (before.last_name as string | null)},
        email = ${body.email ?? before.email},
        email_verified_at = ${body.email && body.email !== before.email ? null : (before.email_verified_at as string | null)}
      WHERE id = ${before.id}
      RETURNING id, email, first_name, last_name, status, mfa_enabled, email_verified_at`;

    await adminAuditChange(c, 'user.update', 'users', before.id, null, before, body);
    return c.json({ user });
  }
);

adminTenancyRoutes.post(
  '/users/:userId/status',
  zValidator('json', destructiveSchema.extend({ status: z.enum(['active', 'suspended']) })),
  async (c) => {
    const body = c.req.valid('json');
    await requireFreshMfa(c, body.mfa_code);
    const sql = c.get('sql');
    const userId = c.req.param('userId');

    const rows = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM users WHERE id = ${userId} LIMIT 1`;
    const before = rows[0];
    if (!before) throw ApiError.notFound('User');

    await sql`UPDATE users SET status = ${body.status} WHERE id = ${userId}`;
    if (body.status === 'suspended') {
      await sql`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
    }
    await sql`
      INSERT INTO security_events (user_id, event_type, severity, metadata)
      VALUES (${userId}, ${`admin.user_${body.status}`}, 'warning',
              ${sql.json({ reason: body.reason, admin: c.get('user')?.email ?? null } as never)})`;

    await adminAudit(c, `user.${body.status}`, 'users', userId, null, {
      reason: body.reason,
      previous_status: before.status,
    });
    return c.json({ ok: true, status: body.status });
  }
);

/**
 * MFA reset for a locked-out customer. Clears the secret so the next login
 * proceeds without a code and the customer can re-enrol. Recovery codes are
 * dropped too — leaving them live would keep an old device usable.
 */
adminTenancyRoutes.post('/users/:userId/reset-mfa', zValidator('json', destructiveSchema), async (c) => {
  const body = c.req.valid('json');
  await requireFreshMfa(c, body.mfa_code);
  const sql = c.get('sql');
  const userId = c.req.param('userId');

  const rows = await sql<{ id: string }[]>`SELECT id FROM users WHERE id = ${userId} LIMIT 1`;
  if (!rows[0]) throw ApiError.notFound('User');

  await sql.begin(async (tx) => {
    await tx`UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_verified_at = NULL WHERE id = ${userId}`;
    await tx`DELETE FROM mfa_recovery_codes WHERE user_id = ${userId}`;
    await tx`
      INSERT INTO security_events (user_id, event_type, severity, metadata)
      VALUES (${userId}, 'admin.mfa_reset', 'critical',
              ${tx.json({ reason: body.reason, admin: c.get('user')?.email ?? null } as never)})`;
  });

  await adminAudit(c, 'user.mfa_reset', 'users', userId, null, { reason: body.reason });
  return c.json({ ok: true });
});

/**
 * Issue a password-reset link on the customer's behalf. Transactional email is
 * still gated behind EMAIL_WEBHOOK_URL, so the link is returned here for the
 * operator to hand over through a verified channel. It is single-use and
 * expires in an hour like any other reset token.
 */
adminTenancyRoutes.post('/users/:userId/password-reset', requireStepUp, zValidator('json', z.object({ reason: z.string().min(3).max(500) })), async (c) => {
  const sql = c.get('sql');
  const userId = c.req.param('userId');
  const body = c.req.valid('json');

  const rows = await sql<{ id: string; email: string }[]>`
    SELECT id, email FROM users WHERE id = ${userId} LIMIT 1`;
  const user = rows[0];
  if (!user) throw ApiError.notFound('User');

  const token = randomHex(32);
  await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${await sha256Hex(token)}, NOW() + INTERVAL '1 hour')`;
  await sql`
    INSERT INTO security_events (user_id, event_type, severity, metadata)
    VALUES (${user.id}, 'admin.password_reset_issued', 'warning',
            ${sql.json({ reason: body.reason, admin: c.get('user')?.email ?? null } as never)})`;

  await adminAudit(c, 'user.password_reset_issued', 'users', user.id, null, { reason: body.reason });
  return c.json({
    email: user.email,
    reset_url: `${c.env.PUBLIC_ACCOUNT_URL}/reset?token=${token}`,
    expires_in_seconds: 3600,
  });
});

adminTenancyRoutes.post('/users/:userId/revoke-sessions', requireStepUp, zValidator('json', z.object({ reason: z.string().min(3).max(500) })), async (c) => {
  const sql = c.get('sql');
  const userId = c.req.param('userId');
  const revoked = await sql<{ id: string }[]>`
    UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL RETURNING id`;
  await adminAudit(c, 'user.sessions_revoked', 'users', userId, null, {
    reason: c.req.valid('json').reason,
    revoked_count: revoked.length,
  });
  return c.json({ ok: true, revoked: revoked.length });
});
