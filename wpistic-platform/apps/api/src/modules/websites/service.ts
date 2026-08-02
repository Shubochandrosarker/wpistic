/**
 * Website registry: one row per organization + normalized domain, shared by
 * every product. Connection tokens (`wpconn_`-prefixed, SHA-256 stored)
 * identify an installation without re-sending the license key on every
 * heartbeat.
 */
import type { Sql } from 'postgres';
import { ApiError } from '../../errors';
import { randomHex, sha256Hex } from '../../utils/crypto';
import { detectEnvironment, normalizeDomain } from '../../utils/domain';
import type { EventBus } from '../../events/bus';
import type { SiteEnvironment } from '@wpistic/types';

function generateConnectionToken(): string {
  return `wpconn_${randomHex(16)}`;
}

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
    const token = generateConnectionToken();

    const rows = await this.sql`
      INSERT INTO websites (organization_id, domain, domain_normalized, name, environment, connection_token_hash, display_domain)
      VALUES (${orgId}, ${input.domain}, ${normalized}, ${input.name ?? null}, ${environment}, ${await sha256Hex(token)}, ${normalized})
      ON CONFLICT (organization_id, domain_normalized)
      DO UPDATE SET name = COALESCE(${input.name ?? null}, websites.name),
                    connection_token_hash = ${await sha256Hex(token)}
      RETURNING id, domain, domain_normalized, name, environment, is_connected, health_status,
                wp_version, php_version, last_sync_at`;
    return { website: rows[0]!, connection_token: token };
  }

  /**
   * Plugin connect flow: activation-token authenticated (verified by the
   * caller — see websiteConnectRoute). Enforces max_websites for the
   * license's organization, then issues the website's connection token and
   * marks it connected.
   */
  async connect(
    license: { organization_id: string; product_id: string; max_websites: number },
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
    const token = generateConnectionToken();
    const tokenHash = await sha256Hex(token);

    const website = await this.sql.begin(async (tx) => {
      const activeRows = await tx<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM websites
        WHERE organization_id = ${license.organization_id} AND is_connected = TRUE AND domain_normalized != ${normalized}`;
      const activeCount = parseInt(activeRows[0]?.count ?? '0', 10);
      if (activeCount >= license.max_websites) {
        throw new ApiError(
          409,
          'max_websites_reached',
          `This license allows ${license.max_websites} connected website(s); disconnect one first or upgrade.`
        );
      }

      const rows = await tx<{ id: string }[]>`
        INSERT INTO websites (organization_id, domain, domain_normalized, name, environment,
                              wp_version, php_version, is_connected, connection_token_hash, display_domain, last_sync_at)
        VALUES (${license.organization_id}, ${input.domain}, ${normalized}, ${input.name ?? null}, ${environment},
                ${input.wp_version ?? null}, ${input.php_version ?? null}, TRUE, ${tokenHash}, ${normalized}, NOW())
        ON CONFLICT (organization_id, domain_normalized)
        DO UPDATE SET is_connected = TRUE, connection_token_hash = ${tokenHash},
                      wp_version = COALESCE(${input.wp_version ?? null}, websites.wp_version),
                      php_version = COALESCE(${input.php_version ?? null}, websites.php_version),
                      last_sync_at = NOW(), health_status = 'healthy'
        RETURNING id`;
      const websiteId = rows[0]!.id;

      await tx`
        INSERT INTO website_installations (website_id, product_id, version, last_seen_at)
        VALUES (${websiteId}, ${license.product_id}, ${input.product_version ?? null}, NOW())
        ON CONFLICT (website_id, product_id)
        DO UPDATE SET version = ${input.product_version ?? null}, last_seen_at = NOW()`;
      return websiteId;
    });

    await this.events.publish('website.connected', { website_id: website, org_id: license.organization_id, domain: normalized });
    return { website_id: website, connection_token: token };
  }

  /** Heartbeat: connection-token authenticated (X-Website-Token header) health + version sync. Fails closed. */
  async heartbeat(
    connectionToken: string,
    input: {
      wp_version?: string;
      php_version?: string;
      health?: 'healthy' | 'warning' | 'critical';
      products?: Array<{ slug: string; version?: string }>;
    }
  ) {
    if (!connectionToken) throw ApiError.unauthorized('X-Website-Token header is required');
    const rows = await this.sql<{ id: string; organization_id: string }[]>`
      SELECT id, organization_id FROM websites
      WHERE connection_token_hash = ${await sha256Hex(connectionToken)}
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

  /** Disconnect: revoke the connection token, mark offline. Caller cascades license-activation deactivation. */
  async disconnect(orgId: string, websiteId: string): Promise<void> {
    const rows = await this.sql`
      UPDATE websites
      SET is_connected = FALSE, connection_token_hash = NULL, health_status = 'offline'
      WHERE id = ${websiteId} AND organization_id = ${orgId}
      RETURNING id`;
    if ((rows ?? []).length === 0) throw ApiError.notFound('Website');
  }

  /** Active license_activations linked to a website — used to cascade-deactivate on disconnect. */
  async listActiveActivationsForWebsite(websiteId: string) {
    return this.sql<
      Array<{
        id: string;
        license_id: string;
        organization_id: string;
        website_id: string | null;
        domain_normalized: string;
        installation_uuid: string;
        environment: string;
        status: string;
        token_hash: string | null;
      }>
    >`
      SELECT id, license_id, organization_id, website_id, domain_normalized, installation_uuid, environment, status, token_hash
      FROM license_activations WHERE website_id = ${websiteId} AND status = 'active'`;
  }
}
