/**
 * License engine: issuance, activation, validation, deactivation, refresh,
 * rotation, and admin actions. Raw keys are shown exactly once; only SHA-256
 * hashes are stored. Validation responses are HMAC-signed with a per-license
 * verification key so plugins verify offline without the master secret.
 */
import type { Sql } from 'postgres';
import type {
  ActivateLicenseInput,
  EntitlementMap,
  LicenseActivationResponse,
  LicenseStatus,
  LicenseValidationResponse,
  SiteEnvironment,
  UpdateChannel,
} from '@wpistic/types';
import { ApiError } from '../../errors';
import {
  deriveLicenseVerificationKey,
  generateLicenseKey,
  sha256Hex,
  signCompactJwt,
  signLicensePayload,
  verifyCompactJwt,
} from '../../utils/crypto';
import { countsTowardActivationLimit, detectEnvironment, normalizeDomain } from '../../utils/domain';
import { LICENSE_CHECK_AFTER_SECONDS, LICENSE_GRACE_PERIOD_DAYS, ACTIVATION_TOKEN_TTL_DAYS } from '../../env';
import type { EventBus } from '../../events/bus';
import { EntitlementService } from '../entitlements/service';

export interface LicenseRow {
  id: string;
  organization_id: string;
  product_id: string;
  plan_id: string;
  subscription_id: string | null;
  key_mask: string;
  key_prefix: string;
  status: LicenseStatus;
  max_activations: number;
  expires_at: string | null;
  product_slug: string;
  product_name: string;
  plan_slug: string;
}

export interface ActivationRow {
  id: string;
  license_id: string;
  organization_id: string;
  website_id: string | null;
  domain_normalized: string;
  installation_uuid: string;
  environment: SiteEnvironment;
  status: 'active' | 'inactive' | 'revoked';
}

export interface ActivationTokenClaims extends Record<string, unknown> {
  lic: string;
  act: string;
  org: string;
  prod: string;
  dom: string;
}

export class LicenseService {
  constructor(
    private sql: Sql,
    private events: EventBus,
    private signingSecret: string,
    private cache: KVNamespace
  ) {}

  // -------------------------------------------------------------------------
  // Issuance
  // -------------------------------------------------------------------------

  async issue(input: {
    organizationId: string;
    productId: string;
    planId: string;
    subscriptionId?: string | null;
    maxActivations?: number;
    expiresAt?: Date | null;
  }): Promise<{ licenseId: string; rawKey: string; mask: string }> {
    const products = await this.sql<{ slug: string }[]>`
      SELECT slug FROM products WHERE id = ${input.productId} LIMIT 1`;
    const product = products[0];
    if (!product) throw ApiError.notFound('Product');

    // Activation limit defaults to the plan's `<product>.sites.max` entitlement.
    let maxActivations = input.maxActivations ?? 1;
    if (input.maxActivations === undefined) {
      const limits = await this.sql<{ value: number }[]>`
        SELECT pe.value::int AS value
        FROM plan_entitlements pe
        JOIN features f ON f.id = pe.feature_id
        WHERE pe.plan_id = ${input.planId} AND f.key = ${`${product.slug}.sites.max`}
        LIMIT 1`;
      if (limits[0]) maxActivations = limits[0].value;
    }

    const { key, prefix, mask } = generateLicenseKey(product.slug);
    const rows = await this.sql<{ id: string }[]>`
      INSERT INTO licenses (organization_id, product_id, plan_id, subscription_id, key_hash, key_prefix, key_mask,
                            max_activations, expires_at)
      VALUES (${input.organizationId}, ${input.productId}, ${input.planId}, ${input.subscriptionId ?? null},
              ${await sha256Hex(key)}, ${prefix}, ${mask}, ${maxActivations}, ${input.expiresAt ?? null})
      RETURNING id`;
    const licenseId = rows[0]!.id;

    await this.logEvent(licenseId, 'issued', null, null, {});
    await this.events.publish('license.issued', {
      license_id: licenseId,
      org_id: input.organizationId,
      product_id: input.productId,
    });

    return { licenseId, rawKey: key, mask };
  }

  // -------------------------------------------------------------------------
  // Activation (public, key-authenticated)
  // -------------------------------------------------------------------------

  async activate(input: ActivateLicenseInput, ip: string | null, userAgent: string | null): Promise<LicenseActivationResponse> {
    const license = await this.findByKey(input.key);
    if (!license) throw ApiError.badRequest('invalid_key', 'License key not recognized');

    this.assertUsable(license);

    const domain = normalizeDomain(input.domain);
    if (!domain) throw ApiError.badRequest('invalid_domain', 'A valid domain is required');
    const environment = detectEnvironment(domain, input.environment);

    const activation = await this.sql.begin(async (tx) => {
      // Serialize per-license concurrent activations for a correct seat count.
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`license:${license.id}`}))`;

      const existingRows = await tx<ActivationRow[]>`
        SELECT id, license_id, organization_id, website_id, domain_normalized, installation_uuid, environment, status
        FROM license_activations
        WHERE license_id = ${license.id} AND installation_uuid = ${input.installation_uuid}
        LIMIT 1`;
      const existing = existingRows[0];

      if (existing?.status === 'revoked') {
        throw ApiError.forbidden('This installation has been revoked — contact support');
      }

      if (!existing || existing.status === 'inactive') {
        const countRows = await tx<{ count: string }[]>`
          SELECT COUNT(*)::text AS count FROM license_activations
          WHERE license_id = ${license.id} AND status = 'active' AND environment = 'production'`;
        const activeCount = parseInt(countRows[0]?.count ?? '0', 10);
        if (countsTowardActivationLimit(environment) && activeCount >= license.max_activations) {
          throw new ApiError(
            409,
            'activation_limit_reached',
            `Activation limit reached (${activeCount}/${license.max_activations}). Deactivate another site or upgrade.`
          );
        }
      }

      // Website registry: one row per org+domain, linked to this activation.
      const websiteRows = await tx<{ id: string }[]>`
        INSERT INTO websites (organization_id, domain, domain_normalized, environment, wp_version, php_version)
        VALUES (${license.organization_id}, ${input.domain}, ${domain}, ${environment},
                ${input.wp_version ?? null}, ${input.php_version ?? null})
        ON CONFLICT (organization_id, domain_normalized)
        DO UPDATE SET wp_version = COALESCE(EXCLUDED.wp_version, websites.wp_version),
                      php_version = COALESCE(EXCLUDED.php_version, websites.php_version)
        RETURNING id`;
      const websiteId = websiteRows[0]!.id;

      const rows = await tx<ActivationRow[]>`
        INSERT INTO license_activations (license_id, organization_id, website_id, domain_normalized, installation_uuid,
                                         site_url, home_url, environment, product_version, wp_version, php_version, status)
        VALUES (${license.id}, ${license.organization_id}, ${websiteId}, ${domain}, ${input.installation_uuid},
                ${input.site_url ?? null}, ${input.home_url ?? null}, ${environment},
                ${input.product_version ?? null}, ${input.wp_version ?? null}, ${input.php_version ?? null}, 'active')
        ON CONFLICT (license_id, installation_uuid)
        DO UPDATE SET status = 'active', deactivated_at = NULL, domain_normalized = ${domain},
                      website_id = ${websiteId}, site_url = ${input.site_url ?? null},
                      environment = ${environment}, product_version = ${input.product_version ?? null},
                      wp_version = ${input.wp_version ?? null}, php_version = ${input.php_version ?? null},
                      last_seen_at = NOW(), last_checked_at = NOW()
        RETURNING id, license_id, organization_id, website_id, domain_normalized, installation_uuid, environment, status`;

      await tx`
        INSERT INTO website_installations (website_id, product_id, version, license_id, last_seen_at)
        VALUES (${websiteId}, ${license.product_id}, ${input.product_version ?? null}, ${license.id}, NOW())
        ON CONFLICT (website_id, product_id)
        DO UPDATE SET version = ${input.product_version ?? null}, license_id = ${license.id}, last_seen_at = NOW()`;

      return rows[0]!;
    });

    await this.logEvent(license.id, 'activated', ip, userAgent, {
      domain,
      environment,
      installation_uuid: input.installation_uuid,
    });
    await this.events.publish('license.activated', {
      license_id: license.id,
      org_id: license.organization_id,
      domain,
    });

    const base = await this.buildValidationResponse(license, activation);
    const activationToken = await signCompactJwt(
      this.signingSecret,
      {
        lic: license.id,
        act: activation.id,
        org: license.organization_id,
        prod: license.product_slug,
        dom: domain,
      } satisfies ActivationTokenClaims,
      ACTIVATION_TOKEN_TTL_DAYS * 86400
    );

    return {
      ...base,
      activation_token: activationToken,
      verification_key: await deriveLicenseVerificationKey(this.signingSecret, license.id),
    };
  }

  // -------------------------------------------------------------------------
  // Validation / refresh / deactivation (activation-token authenticated)
  // -------------------------------------------------------------------------

  async validate(activationToken: string): Promise<LicenseValidationResponse> {
    const { license, activation } = await this.resolveActivationToken(activationToken);

    await this.sql`
      UPDATE license_activations SET last_checked_at = NOW(), last_seen_at = NOW()
      WHERE id = ${activation.id}`;

    return this.buildValidationResponse(license, activation);
  }

  async refresh(activationToken: string): Promise<LicenseActivationResponse> {
    const { license, activation } = await this.resolveActivationToken(activationToken);
    this.assertUsable(license);

    const newToken = await signCompactJwt(
      this.signingSecret,
      {
        lic: license.id,
        act: activation.id,
        org: license.organization_id,
        prod: license.product_slug,
        dom: activation.domain_normalized,
      } satisfies ActivationTokenClaims,
      ACTIVATION_TOKEN_TTL_DAYS * 86400
    );
    const base = await this.buildValidationResponse(license, activation);
    return {
      ...base,
      activation_token: newToken,
      verification_key: await deriveLicenseVerificationKey(this.signingSecret, license.id),
    };
  }

  async deactivate(activationToken: string, installationUuid: string, ip: string | null): Promise<void> {
    const claims = await verifyCompactJwt<ActivationTokenClaims>(this.signingSecret, activationToken);
    if (!claims) throw ApiError.unauthorized('Activation token is invalid or expired');

    const rows = await this.sql<ActivationRow[]>`
      SELECT id, license_id, organization_id, website_id, domain_normalized, installation_uuid, environment, status
      FROM license_activations
      WHERE id = ${claims.act} AND installation_uuid = ${installationUuid}
      LIMIT 1`;
    const activation = rows[0];
    if (!activation) throw ApiError.notFound('Activation');

    await this.deactivateById(activation, 'plugin_request', ip);
  }

  async deactivateById(activation: ActivationRow, reason: string, ip: string | null): Promise<void> {
    await this.sql`
      UPDATE license_activations SET status = 'inactive', deactivated_at = NOW()
      WHERE id = ${activation.id} AND status = 'active'`;
    await this.logEvent(activation.license_id, 'deactivated', ip, null, {
      domain: activation.domain_normalized,
      reason,
    });
    await this.events.publish('license.deactivated', {
      license_id: activation.license_id,
      org_id: activation.organization_id,
    });
  }

  // -------------------------------------------------------------------------
  // Dashboard operations
  // -------------------------------------------------------------------------

  async listForOrg(orgId: string) {
    return this.sql`
      SELECT l.id, p.slug AS product, p.name AS product_name, pl.slug AS plan,
             l.key_mask, l.status, l.max_activations, l.expires_at, l.created_at,
             (SELECT COUNT(*)::int FROM license_activations a
               WHERE a.license_id = l.id AND a.status = 'active') AS active_activations
      FROM licenses l
      JOIN products p ON p.id = l.product_id
      JOIN plans pl ON pl.id = l.plan_id
      WHERE l.organization_id = ${orgId}
      ORDER BY l.created_at DESC`;
  }

  async getWithActivations(orgId: string, licenseId: string) {
    const licenses = await this.sql`
      SELECT l.id, p.slug AS product, p.name AS product_name, pl.slug AS plan,
             l.key_mask, l.status, l.max_activations, l.expires_at, l.created_at,
             (SELECT COUNT(*)::int FROM license_activations a
               WHERE a.license_id = l.id AND a.status = 'active') AS active_activations
      FROM licenses l
      JOIN products p ON p.id = l.product_id
      JOIN plans pl ON pl.id = l.plan_id
      WHERE l.id = ${licenseId} AND l.organization_id = ${orgId}
      LIMIT 1`;
    const license = licenses[0];
    if (!license) throw ApiError.notFound('License');

    const activations = await this.sql`
      SELECT id, domain_normalized, environment, status, product_version, wp_version,
             first_activated_at, last_seen_at
      FROM license_activations
      WHERE license_id = ${licenseId}
      ORDER BY first_activated_at DESC`;
    return { license, activations };
  }

  /** Rotate the key: same license row, new secret. Old key stops working instantly. */
  async rotate(orgId: string, licenseId: string): Promise<{ rawKey: string; mask: string }> {
    const rows = await this.sql<{ id: string; slug: string }[]>`
      SELECT l.id, p.slug FROM licenses l
      JOIN products p ON p.id = l.product_id
      WHERE l.id = ${licenseId} AND l.organization_id = ${orgId} AND l.status = 'active'
      LIMIT 1`;
    const license = rows[0];
    if (!license) throw ApiError.notFound('License');

    const { key, prefix, mask } = generateLicenseKey(license.slug);
    await this.sql`
      UPDATE licenses SET key_hash = ${await sha256Hex(key)}, key_prefix = ${prefix}, key_mask = ${mask}
      WHERE id = ${licenseId}`;
    await this.logEvent(licenseId, 'rotated', null, null, {});
    return { rawKey: key, mask };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async findByKey(rawKey: string): Promise<LicenseRow | null> {
    const rows = await this.sql<LicenseRow[]>`
      SELECT l.id, l.organization_id, l.product_id, l.plan_id, l.subscription_id, l.key_mask, l.key_prefix,
             l.status, l.max_activations, l.expires_at,
             p.slug AS product_slug, p.name AS product_name, pl.slug AS plan_slug
      FROM licenses l
      JOIN products p ON p.id = l.product_id
      JOIN plans pl ON pl.id = l.plan_id
      WHERE l.key_hash = ${await sha256Hex(rawKey.trim())}
      LIMIT 1`;
    return rows[0] ?? null;
  }

  async loadById(licenseId: string): Promise<LicenseRow | null> {
    const rows = await this.sql<LicenseRow[]>`
      SELECT l.id, l.organization_id, l.product_id, l.plan_id, l.subscription_id, l.key_mask, l.key_prefix,
             l.status, l.max_activations, l.expires_at,
             p.slug AS product_slug, p.name AS product_name, pl.slug AS plan_slug
      FROM licenses l
      JOIN products p ON p.id = l.product_id
      JOIN plans pl ON pl.id = l.plan_id
      WHERE l.id = ${licenseId}
      LIMIT 1`;
    return rows[0] ?? null;
  }

  private assertUsable(license: LicenseRow): void {
    if (license.status === 'revoked') throw ApiError.forbidden('This license has been revoked');
    if (license.status === 'suspended') throw ApiError.forbidden('This license is suspended — contact support');
    if (license.status === 'transferred') throw ApiError.forbidden('This license has been transferred');
    if (license.status === 'expired' || (license.expires_at && new Date(license.expires_at) < new Date())) {
      throw new ApiError(402, 'license_expired', 'This license has expired — renew to continue');
    }
  }

  async resolveActivationToken(token: string): Promise<{ license: LicenseRow; activation: ActivationRow }> {
    const claims = await verifyCompactJwt<ActivationTokenClaims>(this.signingSecret, token);
    if (!claims) throw ApiError.unauthorized('Activation token is invalid or expired');

    const license = await this.loadById(claims.lic);
    if (!license) throw ApiError.notFound('License');

    const rows = await this.sql<ActivationRow[]>`
      SELECT id, license_id, organization_id, website_id, domain_normalized, installation_uuid, environment, status
      FROM license_activations WHERE id = ${claims.act} LIMIT 1`;
    const activation = rows[0];
    if (!activation) throw ApiError.notFound('Activation');

    return { license, activation };
  }

  async buildValidationResponse(license: LicenseRow, activation: ActivationRow): Promise<LicenseValidationResponse> {
    const expired = license.expires_at !== null && new Date(license.expires_at) < new Date();
    const valid = license.status === 'active' && !expired && activation.status === 'active';

    let entitlements: EntitlementMap = {};
    if (valid) {
      const entService = new EntitlementService(this.sql, this.cache);
      const resolution = await entService.resolveForOrg(license.organization_id, license.product_slug);
      entitlements = resolution.entitlements;
    }

    const channelRows = valid
      ? await this.sql<{ value: string }[]>`
          SELECT pe.value #>> '{}' AS value
          FROM plan_entitlements pe
          JOIN features f ON f.id = pe.feature_id
          WHERE pe.plan_id = ${license.plan_id} AND f.key = ${`${license.product_slug}.updates.channel`}
          LIMIT 1`
      : [];
    const channel = (channelRows[0]?.value ?? 'stable') as UpdateChannel;

    const payload: Omit<LicenseValidationResponse, 'signature'> = {
      valid,
      status: expired && license.status === 'active' ? 'expired' : license.status,
      product: license.product_slug,
      plan: license.plan_slug,
      expires_at: license.expires_at,
      activation:
        activation.status === 'active'
          ? { id: activation.id, domain: activation.domain_normalized, environment: activation.environment }
          : null,
      entitlements,
      updates: { channel, allowed: valid },
      check_after: LICENSE_CHECK_AFTER_SECONDS,
      grace_period_days: LICENSE_GRACE_PERIOD_DAYS,
    };

    const verificationKey = await deriveLicenseVerificationKey(this.signingSecret, license.id);
    const signature = await signLicensePayload(verificationKey, payload as unknown as Record<string, unknown>);
    return { ...payload, signature };
  }

  async logEvent(
    licenseId: string,
    eventType: string,
    ip: string | null,
    userAgent: string | null,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.sql`
      INSERT INTO license_events (license_id, event_type, ip_address, user_agent, metadata)
      VALUES (${licenseId}, ${eventType}, ${ip}, ${userAgent}, ${this.sql.json(metadata as never)})`;
  }
}
