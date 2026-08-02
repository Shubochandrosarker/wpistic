/**
 * Entitlement resolution engine. Merges plan entitlements from every active
 * subscription item and license the organization holds into one flat map.
 *
 * Merge rules when the same feature key appears from multiple sources:
 *   numbers → max wins, booleans → true wins, strings/lists → newest source wins.
 *
 * Product code never checks plan names — only entitlement keys.
 */
import type { Sql } from 'postgres';
import type { EntitlementMap, EntitlementResolution, EntitlementValue } from '@wpistic/types';
import { ENTITLED_SUBSCRIPTION_STATUSES } from '@wpistic/types';

interface EntitlementRow {
  key: string;
  value: EntitlementValue;
  source_type: 'subscription' | 'license';
  source_id: string;
  product_slug: string;
  plan_slug: string;
  source_created_at: string;
}

const CACHE_TTL_SECONDS = 60;

export class EntitlementService {
  constructor(
    private sql: Sql,
    private cache: KVNamespace
  ) {}

  async resolveForOrg(orgId: string, productSlug?: string): Promise<EntitlementResolution> {
    const cacheKey = `ent:${orgId}`;
    let resolution: EntitlementResolution | null = null;

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      resolution = JSON.parse(cached) as EntitlementResolution;
    } else {
      resolution = await this.compute(orgId);
      await this.cache.put(cacheKey, JSON.stringify(resolution), { expirationTtl: CACHE_TTL_SECONDS });
    }

    if (!productSlug) return resolution;
    const prefix = `${productSlug}.`;
    return {
      ...resolution,
      entitlements: Object.fromEntries(
        Object.entries(resolution.entitlements).filter(([key]) => key.startsWith(prefix))
      ),
      sources: resolution.sources.filter((s) => s.product === productSlug),
    };
  }

  async invalidate(orgId: string): Promise<void> {
    await this.cache.delete(`ent:${orgId}`);
  }

  private async compute(orgId: string): Promise<EntitlementResolution> {
    const rows = await this.sql<EntitlementRow[]>`
      SELECT f.key,
             pe.value,
             'subscription' AS source_type,
             s.id AS source_id,
             p.slug AS product_slug,
             pl.slug AS plan_slug,
             s.created_at AS source_created_at
      FROM subscriptions s
      JOIN subscription_items si ON si.subscription_id = s.id
      JOIN plans pl ON pl.id = si.plan_id
      JOIN products p ON p.id = si.product_id
      JOIN plan_entitlements pe ON pe.plan_id = pl.id
      JOIN features f ON f.id = pe.feature_id
      WHERE s.organization_id = ${orgId}
        AND s.status IN ${this.sql(ENTITLED_SUBSCRIPTION_STATUSES as unknown as string[])}

      UNION ALL

      SELECT f.key,
             pe.value,
             'license' AS source_type,
             l.id AS source_id,
             p.slug AS product_slug,
             pl.slug AS plan_slug,
             l.created_at AS source_created_at
      FROM licenses l
      JOIN plans pl ON pl.id = l.plan_id
      JOIN products p ON p.id = l.product_id
      JOIN plan_entitlements pe ON pe.plan_id = pl.id
      JOIN features f ON f.id = pe.feature_id
      WHERE l.organization_id = ${orgId}
        AND l.status = 'active'
        AND (l.expires_at IS NULL OR l.expires_at > NOW())
      ORDER BY source_created_at ASC`;

    const entitlements: EntitlementMap = {};
    const sourcesSeen = new Map<string, EntitlementResolution['sources'][number]>();

    for (const row of rows) {
      const value = row.value;
      const existing = entitlements[row.key];
      if (existing === undefined) {
        entitlements[row.key] = value;
      } else if (typeof existing === 'number' && typeof value === 'number') {
        entitlements[row.key] = Math.max(existing, value);
      } else if (typeof existing === 'boolean' && typeof value === 'boolean') {
        entitlements[row.key] = existing || value;
      } else {
        entitlements[row.key] = value; // newest source wins (rows are time-ordered)
      }
      sourcesSeen.set(`${row.source_type}:${row.source_id}`, {
        type: row.source_type,
        id: row.source_id,
        product: row.product_slug,
        plan: row.plan_slug,
      });
    }

    return {
      entitlements,
      sources: [...sourcesSeen.values()],
      version: Math.floor(Date.now() / 1000),
      resolved_at: new Date().toISOString(),
    };
  }
}
