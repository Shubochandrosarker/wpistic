/**
 * Organizations module: creation (with owner membership), profile updates,
 * and owned-products summary.
 */
import type { Sql } from 'postgres';
import { ApiError } from '../../errors';
import type { EventBus } from '../../events/bus';
import { ENTITLED_SUBSCRIPTION_STATUSES } from '@wpistic/types';

export class OrgService {
  constructor(
    private sql: Sql,
    private events: EventBus
  ) {}

  async create(userId: string, name: string, slugInput?: string, billingEmail?: string) {
    const base =
      slugInput ??
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    if (!base) throw ApiError.badRequest('invalid_slug', 'Could not derive a slug from the organization name');

    const org = await this.sql.begin(async (tx) => {
      let slug = base;
      for (let attempt = 0; ; attempt++) {
        const taken = await tx`SELECT 1 FROM organizations WHERE slug = ${slug} LIMIT 1`;
        if (taken.length === 0) break;
        if (slugInput) throw ApiError.conflict('slug_taken', 'That slug is already in use');
        slug = attempt < 2 ? `${base}-${attempt + 2}` : `${base}-${crypto.randomUUID().slice(0, 8)}`;
      }
      const rows = await tx`
        INSERT INTO organizations (name, slug, billing_email)
        VALUES (${name}, ${slug}, ${billingEmail ?? null})
        RETURNING id, name, slug, avatar_url, billing_email, status, created_at`;
      await tx`
        INSERT INTO organization_memberships (user_id, organization_id, role)
        VALUES (${userId}, ${rows[0]!.id}, 'owner')`;
      return rows[0]!;
    });

    await this.events.publish('organization.created', {
      org_id: org.id as string,
      name,
      owner_id: userId,
    });
    return org;
  }

  async get(orgId: string) {
    const rows = await this.sql`
      SELECT id, name, slug, avatar_url, billing_email, billing_address, tax_id, status, created_at,
             (SELECT COUNT(*)::int FROM organization_memberships m
               WHERE m.organization_id = organizations.id AND m.status = 'active') AS member_count
      FROM organizations WHERE id = ${orgId} LIMIT 1`;
    if (!rows[0]) throw ApiError.notFound('Organization');
    return rows[0];
  }

  async update(
    orgId: string,
    data: {
      name?: string;
      billing_email?: string | null;
      billing_address?: Record<string, unknown> | null;
      tax_id?: string | null;
    }
  ) {
    const rows = await this.sql`
      UPDATE organizations
      SET name = COALESCE(${data.name ?? null}, name),
          billing_email = ${data.billing_email === undefined ? this.sql`billing_email` : data.billing_email},
          billing_address = ${
            data.billing_address === undefined
              ? this.sql`billing_address`
              : data.billing_address === null
                ? null
                : this.sql.json(data.billing_address as never)
          },
          tax_id = ${data.tax_id === undefined ? this.sql`tax_id` : data.tax_id}
      WHERE id = ${orgId}
      RETURNING id, name, slug, avatar_url, billing_email, billing_address, tax_id, status, created_at`;
    if (!rows[0]) throw ApiError.notFound('Organization');
    return rows[0];
  }

  /** Products the org owns, via subscriptions and licenses, with plan + source. */
  async listOwnedProducts(orgId: string) {
    return this.sql`
      SELECT DISTINCT ON (p.id)
             p.id, p.slug, p.name, p.description, p.icon_url, p.app_url, p.marketing_url, p.type, p.status,
             pl.slug AS plan, src.source, src.sub_status
      FROM (
        SELECT si.product_id, si.plan_id, 'subscription' AS source, s.status AS sub_status, s.created_at
        FROM subscriptions s
        JOIN subscription_items si ON si.subscription_id = s.id
        WHERE s.organization_id = ${orgId}
          AND s.status IN ${this.sql(ENTITLED_SUBSCRIPTION_STATUSES as unknown as string[])}
        UNION ALL
        SELECT l.product_id, l.plan_id, 'license' AS source, l.status AS sub_status, l.created_at
        FROM licenses l
        WHERE l.organization_id = ${orgId} AND l.status = 'active'
          AND (l.expires_at IS NULL OR l.expires_at > NOW())
        UNION ALL
        SELECT g.product_id, g.plan_id, 'access_grant' AS source, g.status AS sub_status, g.created_at
        FROM product_access_grants g
        WHERE g.organization_id = ${orgId} AND g.status = 'active'
          AND g.starts_at <= NOW()
          AND (g.ends_at IS NULL OR g.ends_at > NOW())
      ) src
      JOIN products p ON p.id = src.product_id
      JOIN plans pl ON pl.id = src.plan_id
      ORDER BY p.id, src.created_at DESC`;
  }
}
