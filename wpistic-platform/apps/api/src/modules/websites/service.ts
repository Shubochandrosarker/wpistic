/**
 * Website registry: one row per organization + normalized domain, shared by
 * every product. Connection tokens (`wct_`-prefixed, SHA-256 stored) identify
 * an installation without re-sending the license key on every heartbeat.
 */
import type { Sql } from 'postgres';
import { ApiError } from '../../errors';
import { randomHex, sha256Hex } from '../../utils/crypto';
import { detectEnvironment, normalizeDomain } from '../../utils/domain';
import type { EventBus } from '../../events/bus';
import type { SiteEnvironment } from '@wpistic/types';

export class WebsiteService {
  constructor(
    private sql: Sql,
    private events: EventBus
  ) {}

  async listForOrg(orgId: string) {
    return this.sql`
      SELECT w.id, w.domain, w.domain_normalized, w.name, w.environment, w.is_connected,
             w.health_status, w.wp_version, w.php_version, w.last_sync_at, w.created_at,
             COALESCE(
               (SELECT json_agg(json_build_object(
                  'product', p.slug, 'product_name', p.name, 'version', wi.version,
                  'license_id', wi.license_id, 'last_seen_at', wi.last_seen_at))
                FROM website_installations wi
                JOIN products p ON p.id = wi.product_id
                WHERE wi.website_id = w.id),
               '[]'::json) AS installations
      FROM websites w
      WHERE w.organization_id = ${orgId}
      ORDER BY w.created_at DESC`;
  }

  /** Manual "Add Website" from the dashboard — returns the connection token once. */
  async addForOrg(orgId: string, input: { domain: string; name?: string; environment?: SiteEnvironment }) {
    const normalized = normalizeDomain(input.domain);
    if (!normalized) throw ApiError.badRequest('invalid_domain', 'A valid domain is required');
    const environment = detectEnvironment(normalized, input.environment ?? 'production');
    const token = `wct_${randomHex(32)}`;

    const rows = await this.sql`
      INSERT INTO websites (organization_id, domain, domain_normalized, name, environment, connection_token_hash)
      VALUES (${orgId}, ${input.domain}, ${normalized}, ${input.name ?? null}, ${environment}, ${await sha256Hex(token)})
      ON CONFLICT (organization_id, domain_normalized)
      DO UPDATE SET name = COALESCE(${input.name ?? null}, websites.name),
                    connection_token_hash = ${await sha256Hex(token)}
      RETURNING id, domain, domain_normalized, name, environment, is_connected, health_status,
                wp_version, php_version, last_sync_at`;
    return { website: rows[0]!, connection_token: token };
  }

  /**
   * Plugin connect flow (10.4): activation-token authenticated. Issues the
   * website's connection token and marks it connected.
   */
  async connect(
    orgId: string,
    productId: string,
    input: {
      domain: string;
      environment: SiteEnvironment;
      wp_version?: string;
      php_version?: string;
      product_version?: string;
      name?: string;
    }
  ) {
    const normalized = normalizeDomain(input.domain);
    if (!normalized) throw ApiError.badRequest('invalid_domain', 'A valid domain is required');
    const environment = detectEnvironment(normalized, input.environment);
    const token = `wct_${randomHex(32)}`;
    const tokenHash = await sha256Hex(token);

    const website = await this.sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        INSERT INTO websites (organization_id, domain, domain_normalized, name, environment,
                              wp_version, php_version, is_connected, connection_token_hash, last_sync_at)
        VALUES (${orgId}, ${input.domain}, ${normalized}, ${input.name ?? null}, ${environment},
                ${input.wp_version ?? null}, ${input.php_version ?? null}, TRUE, ${tokenHash}, NOW())
        ON CONFLICT (organization_id, domain_normalized)
        DO UPDATE SET is_connected = TRUE, connection_token_hash = ${tokenHash},
                      wp_version = COALESCE(${input.wp_version ?? null}, websites.wp_version),
                      php_version = COALESCE(${input.php_version ?? null}, websites.php_version),
                      last_sync_at = NOW(), health_status = 'healthy'
        RETURNING id`;
      const websiteId = rows[0]!.id;

      await tx`
        INSERT INTO website_installations (website_id, product_id, version, last_seen_at)
        VALUES (${websiteId}, ${productId}, ${input.product_version ?? null}, NOW())
        ON CONFLICT (website_id, product_id)
        DO UPDATE SET version = ${input.product_version ?? null}, last_seen_at = NOW()`;
      return websiteId;
    });

    await this.events.publish('website.connected', { website_id: website, org_id: orgId, domain: normalized });
    return { website_id: website, connection_token: token };
  }

  /** Heartbeat: connection-token authenticated health + version sync. */
  async heartbeat(input: {
    connection_token: string;
    wp_version?: string;
    php_version?: string;
    health?: 'healthy' | 'warning' | 'critical';
    products?: Array<{ slug: string; version?: string }>;
  }) {
    const rows = await this.sql<{ id: string; organization_id: string }[]>`
      SELECT id, organization_id FROM websites
      WHERE connection_token_hash = ${await sha256Hex(input.connection_token)}
      LIMIT 1`;
    const website = rows[0];
    if (!website) throw ApiError.unauthorized('Connection token is invalid — reconnect the site');

    await this.sql`
      UPDATE websites
      SET last_sync_at = NOW(), is_connected = TRUE,
          health_status = ${input.health ?? 'healthy'},
          wp_version = COALESCE(${input.wp_version ?? null}, wp_version),
          php_version = COALESCE(${input.php_version ?? null}, php_version)
      WHERE id = ${website.id}`;

    for (const product of input.products ?? []) {
      await this.sql`
        INSERT INTO website_installations (website_id, product_id, version, last_seen_at)
        SELECT ${website.id}, p.id, ${product.version ?? null}, NOW()
        FROM products p WHERE p.slug = ${product.slug}
        ON CONFLICT (website_id, product_id)
        DO UPDATE SET version = COALESCE(${product.version ?? null}, website_installations.version),
                      last_seen_at = NOW()`;
    }

    return { ok: true, website_id: website.id, next_heartbeat_after: 3600 };
  }

  /** Disconnect: revoke the connection token; license activations stay intact. */
  async disconnect(orgId: string, websiteId: string) {
    const rows = await this.sql`
      UPDATE websites
      SET is_connected = FALSE, connection_token_hash = NULL, health_status = 'unknown'
      WHERE id = ${websiteId} AND organization_id = ${orgId}
      RETURNING id`;
    if (rows.length === 0) throw ApiError.notFound('Website');
  }
}
