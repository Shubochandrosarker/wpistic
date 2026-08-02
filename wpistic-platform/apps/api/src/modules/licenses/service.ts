/**
 * License engine: issuance, activation, validation, deactivation, refresh,
 * rotation, and admin actions. Raw keys are shown exactly once; only SHA-256
 * hashes are stored. Activation tokens are RS256 JWTs; validation responses
 * are HMAC-signed (hex) with a per-license derived key so plugins verify
 * offline without the master secret. The API is the sole source of truth for
 * lifecycle state — the plugin caches, but grace periods, entitlements, and
 * revocation are always decided here.
 */
import type { Sql, TransactionSql } from 'postgres';
import type {
  ActivateLicenseInput,
  ActivationStatus,
  DomainEvent,
  EntitlementMap,
  LicenseActivationResponse,
  LicenseStatus,
  LicenseValidationResponse,
  SiteEnvironment,
  UpdateChannel,
  ValidateLicenseInput,
} from '@wpistic/types';
import { ApiError } from '../../errors';
import {
  deriveLicenseKey,
  generateLicenseKey,
  sha256Hex,
  signActivationToken,
  signLicenseResponse,
  verifyActivationToken,
  type ActivationTokenClaims,
} from '../../utils/crypto';
import { countsTowardActivationLimit, detectEnvironment, normalizeDomain } from '../../utils/domain';
import { LICENSE_CHECK_AFTER_SECONDS, LICENSE_GRACE_PERIOD_DAYS, ACTIVATION_TOKEN_TTL_DAYS } from '../../env';
import { writeOutboxEvent } from '../../events/outbox';
import { EntitlementService } from '../entitlements/service';

export interface LicenseServiceConfig {
  signingSecret: string;
  jwtPrivateKey: string;
  jwtPublicKey: string;
}

export interface Actor {
  type: 'user' | 'admin' | 'system' | 'plugin' | 'webhook';
  id?: string | null;
  email?: string | null;
}

const SYSTEM_ACTOR: Actor = { type: 'system' };
const PLUGIN_ACTOR: Actor = { type: 'plugin' };

export interface LicenseRow {
  id: string;
  organization_id: string;
  product_id: string;
  plan_id: string;
  subscription_id: string | null;
  key_hash: string;
  key_mask: string;
  key_prefix: string;
  status: LicenseStatus;
  max_activations: number;
  max_websites: number;
  expires_at: string | null;
  grace_period_ends_at: string | null;
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
  status: ActivationStatus;
  token_hash: string | null;
}

/** Server-side truth for whether a license may activate/validate/refresh/update right now. */
export interface LicenseLifecycle {
  effectiveStatus: LicenseStatus | 'grace_period' | 'expired';
  usable: boolean;
  inGracePeriod: boolean;
  gracePeriodEndsAt: string | null;
}

export function evaluateLicenseLifecycle(
  license: Pick<LicenseRow, 'status' | 'expires_at' | 'grace_period_ends_at'>,
  now = new Date()
): LicenseLifecycle {
  if (license.status === 'revoked' || license.status === 'suspended' || license.status === 'cancelled') {
    return { effectiveStatus: license.status, usable: false, inGracePeriod: false, gracePeriodEndsAt: null };
  }

  const expiresAt = license.expires_at !== null ? new Date(license.expires_at) : null;
  const isPastExpiry = expiresAt !== null && expiresAt < now;
  if (!isPastExpiry) {
    return { effectiveStatus: 'active', usable: true, inGracePeriod: false, gracePeriodEndsAt: license.grace_period_ends_at };
  }

  const graceEndsAt = license.grace_period_ends_at !== null ? new Date(license.grace_period_ends_at) : null;
  const inGracePeriod = graceEndsAt !== null && graceEndsAt > now;
  return {
    effectiveStatus: inGracePeriod ? 'grace_period' : 'expired',
    usable: inGracePeriod,
    inGracePeriod,
    gracePeriodEndsAt: license.grace_period_ends_at,
  };
}

export class LicenseService {
  constructor(
    private sql: Sql,
    private config: LicenseServiceConfig,
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
    const keyHash = await sha256Hex(key);
    const licenseId = await this.sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        INSERT INTO licenses (organization_id, product_id, plan_id, subscription_id, key_hash, key_prefix, key_mask,
                              max_activations, expires_at)
        VALUES (${input.organizationId}, ${input.productId}, ${input.planId}, ${input.subscriptionId ?? null},
                ${keyHash}, ${prefix}, ${mask}, ${maxActivations}, ${input.expiresAt ?? null})
        RETURNING id`;
      const id = rows[0]!.id;
      await this.logEvent(tx, {
        licenseId: id,
        organizationId: input.organizationId,
        eventType: 'issued',
        actor: { type: 'webhook' },
        meta: { product_id: input.productId, plan_id: input.planId },
      });
      await writeOutboxEvent<Extract<DomainEvent, { type: 'license.issued' }>>(
        tx,
        'license.issued',
        { license_id: id, org_id: input.organizationId, product_id: input.productId },
        input.organizationId
      );
      return id;
    });

    return { licenseId, rawKey: key, mask };
  }

  // -------------------------------------------------------------------------
  // Activation (public, key-authenticated)
  // -------------------------------------------------------------------------

  async activate(input: ActivateLicenseInput, ip: string | null, userAgent: string | null): Promise<LicenseActivationResponse> {
    const license = await this.findByKey(input.key);
    if (!license) throw ApiError.badRequest('invalid_key', 'License key not recognized');

    const lifecycle = await this.ensureLifecycleFresh(license);
    if (!lifecycle.usable) {
      throw ApiError.forbidden(this.lifecycleRejectionMessage(license.status, lifecycle));
    }

    const domain = normalizeDomain(input.domain);
    if (!domain) throw ApiError.badRequest('invalid_domain', 'A valid domain is required');
    const environment = detectEnvironment(domain, input.environment);

    const activation = await this.sql.begin(async (tx) => {
      // Serialize per-license concurrent activations for a correct seat count.
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`license:${license.id}`}))`;

      const existingRows = await tx<ActivationRow[]>`
        SELECT id, license_id, organization_id, website_id, domain_normalized, installation_uuid, environment, status, token_hash
        FROM license_activations
        WHERE license_id = ${license.id} AND installation_uuid = ${input.installation_uuid}
        LIMIT 1`;
      const existing = existingRows[0];

      if (existing?.status === 'suspended') {
        throw ApiError.forbidden('This installation has been suspended — contact support');
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
        RETURNING id, license_id, organization_id, website_id, domain_normalized, installation_uuid, environment, status, token_hash`;
      const row = rows[0]!;

      await tx`
        INSERT INTO website_installations (website_id, product_id, version, license_id, last_seen_at)
        VALUES (${websiteId}, ${license.product_id}, ${input.product_version ?? null}, ${license.id}, NOW())
        ON CONFLICT (website_id, product_id)
        DO UPDATE SET version = ${input.product_version ?? null}, license_id = ${license.id}, last_seen_at = NOW()`;

      await this.logEvent(tx, {
        licenseId: license.id,
        organizationId: license.organization_id,
        eventType: 'activated',
        actor: PLUGIN_ACTOR,
        ip,
        userAgent,
        domain,
        environment,
        meta: { installation_uuid: input.installation_uuid },
      });
      await writeOutboxEvent<Extract<DomainEvent, { type: 'license.activated' }>>(
        tx,
        'license.activated',
        { license_id: license.id, org_id: license.organization_id, domain },
        license.organization_id
      );

      return row;
    });

    const claims: ActivationTokenClaims = {
      sub: activation.id,
      license_id: license.id,
      org_id: license.organization_id,
      product_id: license.product_id,
      domain,
      environment,
      installation_uuid: input.installation_uuid,
    };
    const activationToken = await signActivationToken(this.config.jwtPrivateKey, claims, ACTIVATION_TOKEN_TTL_DAYS * 86400);
    const tokenHash = await sha256Hex(activationToken);
    await this.sql`
      UPDATE license_activations SET token_hash = ${tokenHash} WHERE id = ${activation.id}`;
    activation.token_hash = tokenHash;

    const base = await this.buildValidationResponse(license, activation);
    return {
      ...base,
      activation_token: activationToken,
      verification_key: await deriveLicenseKey(this.config.signingSecret, license.key_hash),
    };
  }

  // -------------------------------------------------------------------------
  // Validation / refresh / deactivation (activation-token authenticated)
  // -------------------------------------------------------------------------

  /**
   * Full validation flow (spec 2.3): verify signature, check the KV
   * blocklist, cross-check every claim against the current DB record, then
   * confirm domain/environment/installation_uuid supplied by the caller
   * still match — a mismatch on any of these is treated as a security
   * anomaly (hard reject), not a soft license state.
   */
  async validate(input: ValidateLicenseInput): Promise<LicenseValidationResponse> {
    const { license, activation } = await this.resolveActivationToken(input.activation_token);

    const normalizedDomain = normalizeDomain(input.domain);
    if (!normalizedDomain || normalizedDomain !== activation.domain_normalized) {
      throw ApiError.forbidden('Activation token does not match the supplied domain');
    }
    if (input.installation_uuid !== activation.installation_uuid || input.environment !== activation.environment) {
      throw ApiError.forbidden('Activation token does not match this installation');
    }

    await this.sql`
      UPDATE license_activations
      SET last_checked_at = NOW(), last_seen_at = NOW(),
          product_version = COALESCE(${input.plugin_version ?? null}, product_version)
      WHERE id = ${activation.id}`;

    await this.ensureLifecycleFresh(license);
    return this.buildValidationResponse(license, activation);
  }

  async refresh(activationToken: string): Promise<LicenseActivationResponse> {
    const { license, activation } = await this.resolveActivationToken(activationToken);
    const lifecycle = await this.ensureLifecycleFresh(license);
    if (!lifecycle.usable) {
      throw ApiError.forbidden(this.lifecycleRejectionMessage(license.status, lifecycle));
    }
    if (activation.status !== 'active') {
      throw ApiError.forbidden('This installation is not active');
    }

    // Revoke the presented token before issuing its replacement.
    const oldTokenHash = await sha256Hex(activationToken);
    await this.cache.put(`revoked_token:${oldTokenHash}`, 'true', { expirationTtl: ACTIVATION_TOKEN_TTL_DAYS * 86400 });

    const claims: ActivationTokenClaims = {
      sub: activation.id,
      license_id: license.id,
      org_id: license.organization_id,
      product_id: license.product_id,
      domain: activation.domain_normalized,
      environment: activation.environment,
      installation_uuid: activation.installation_uuid,
    };
    const newToken = await signActivationToken(this.config.jwtPrivateKey, claims, ACTIVATION_TOKEN_TTL_DAYS * 86400);
    const newTokenHash = await sha256Hex(newToken);
    await this.sql`
      UPDATE license_activations SET token_hash = ${newTokenHash}, last_checked_at = NOW(), last_seen_at = NOW()
      WHERE id = ${activation.id}`;
    activation.token_hash = newTokenHash;

    await this.logEvent(this.sql, {
      licenseId: license.id,
      organizationId: license.organization_id,
      eventType: 'refreshed',
      actor: PLUGIN_ACTOR,
      domain: activation.domain_normalized,
      environment: activation.environment,
      meta: { installation_uuid: activation.installation_uuid },
    });

    const base = await this.buildValidationResponse(license, activation);
    return {
      ...base,
      activation_token: newToken,
      verification_key: await deriveLicenseKey(this.config.signingSecret, license.key_hash),
    };
  }

  async deactivate(activationToken: string, installationUuid: string, ip: string | null): Promise<void> {
    const { activation } = await this.resolveActivationToken(activationToken);
    if (activation.installation_uuid !== installationUuid) {
      throw ApiError.forbidden('Activation token does not match this installation');
    }
    await this.deactivateById(activation, 'plugin_request', ip, PLUGIN_ACTOR);
  }

  async deactivateById(activation: ActivationRow, reason: string, ip: string | null, actor: Actor = SYSTEM_ACTOR): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE license_activations SET status = 'inactive', deactivated_at = NOW()
        WHERE id = ${activation.id} AND status = 'active'`;

      if (activation.token_hash) {
        await this.cache.put(`revoked_token:${activation.token_hash}`, 'true', {
          expirationTtl: ACTIVATION_TOKEN_TTL_DAYS * 86400,
        });
      }

      await this.logEvent(tx, {
        licenseId: activation.license_id,
        organizationId: activation.organization_id,
        eventType: 'deactivated',
        actor,
        ip,
        domain: activation.domain_normalized,
        environment: activation.environment,
        meta: { reason },
      });
      await writeOutboxEvent<Extract<DomainEvent, { type: 'license.deactivated' }>>(
        tx,
        'license.deactivated',
        { license_id: activation.license_id, org_id: activation.organization_id },
        activation.organization_id
      );
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

  /**
   * Rotate the key: same license row, new secret, old key stops working
   * instantly. Every existing activation is revoked — plugins must reactivate
   * with the new key (spec 2.4).
   */
  async rotate(orgId: string, licenseId: string, actor: Actor): Promise<{ rawKey: string; mask: string }> {
    const rows = await this.sql<{ id: string; slug: string }[]>`
      SELECT l.id, p.slug FROM licenses l
      JOIN products p ON p.id = l.product_id
      WHERE l.id = ${licenseId} AND l.organization_id = ${orgId} AND l.status = 'active'
      LIMIT 1`;
    const license = rows[0];
    if (!license) throw ApiError.notFound('License');

    const { key, prefix, mask } = generateLicenseKey(license.slug);
    const keyHash = await sha256Hex(key);

    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE licenses SET key_hash = ${keyHash}, key_prefix = ${prefix}, key_mask = ${mask}
        WHERE id = ${licenseId}`;

      const revoked = await tx<{ id: string; token_hash: string | null }[]>`
        UPDATE license_activations SET status = 'inactive', deactivated_at = NOW()
        WHERE license_id = ${licenseId} AND status = 'active'
        RETURNING id, token_hash`;

      for (const row of revoked) {
        if (row.token_hash) {
          await this.cache.put(`revoked_token:${row.token_hash}`, 'true', {
            expirationTtl: ACTIVATION_TOKEN_TTL_DAYS * 86400,
          });
        }
      }

      await this.logEvent(tx, {
        licenseId,
        organizationId: orgId,
        eventType: 'rotated',
        actor,
        meta: { revoked_activation_count: revoked.length },
      });
    });

    return { rawKey: key, mask };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async findByKey(rawKey: string): Promise<LicenseRow | null> {
    const rows = await this.sql<LicenseRow[]>`
      SELECT l.id, l.organization_id, l.product_id, l.plan_id, l.subscription_id, l.key_hash, l.key_mask, l.key_prefix,
             l.status, l.max_activations, l.max_websites, l.expires_at, l.grace_period_ends_at,
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
      SELECT l.id, l.organization_id, l.product_id, l.plan_id, l.subscription_id, l.key_hash, l.key_mask, l.key_prefix,
             l.status, l.max_activations, l.max_websites, l.expires_at, l.grace_period_ends_at,
             p.slug AS product_slug, p.name AS product_name, pl.slug AS plan_slug
      FROM licenses l
      JOIN products p ON p.id = l.product_id
      JOIN plans pl ON pl.id = l.plan_id
      WHERE l.id = ${licenseId}
      LIMIT 1`;
    return rows[0] ?? null;
  }

  private async loadActivation(activationId: string): Promise<ActivationRow | null> {
    const rows = await this.sql<ActivationRow[]>`
      SELECT id, license_id, organization_id, website_id, domain_normalized, installation_uuid, environment, status, token_hash
      FROM license_activations WHERE id = ${activationId} LIMIT 1`;
    return rows[0] ?? null;
  }

  private lifecycleRejectionMessage(status: LicenseStatus, lifecycle: LicenseLifecycle): string {
    if (status === 'revoked') return 'This license has been revoked';
    if (status === 'suspended') return 'This license is suspended — contact support';
    if (status === 'cancelled') return 'This license has been cancelled';
    if (lifecycle.effectiveStatus === 'expired') return 'This license has expired';
    return 'This license is not usable right now';
  }

  /**
   * Grace period is server-side truth (spec 2.5): the moment a license is
   * first observed past its expiry date, `grace_period_ends_at` is pinned to
   * exactly 7 days out and persisted — every subsequent check reads the same
   * fixed deadline rather than a moving window.
   */
  private async ensureLifecycleFresh(license: LicenseRow): Promise<LicenseLifecycle> {
    const now = new Date();
    const expiresAt = license.expires_at !== null ? new Date(license.expires_at) : null;
    const isPastExpiry = expiresAt !== null && expiresAt < now;

    if (isPastExpiry && !license.grace_period_ends_at) {
      const graceEndsAt = new Date(now.getTime() + LICENSE_GRACE_PERIOD_DAYS * 86400 * 1000);
      await this.sql`
        UPDATE licenses SET grace_period_ends_at = ${graceEndsAt}
        WHERE id = ${license.id} AND grace_period_ends_at IS NULL`;
      license.grace_period_ends_at = graceEndsAt.toISOString();
    }

    return evaluateLicenseLifecycle(license, now);
  }

  /** Public wrapper for update/download routes that share lifecycle rules. */
  async ensureLifecycleFreshForRequest(license: LicenseRow): Promise<LicenseLifecycle> {
    return this.ensureLifecycleFresh(license);
  }

  /**
   * Resolve+verify an activation token against the current DB state (spec
   * 2.3 steps 1–4): signature, blocklist, then every claim must still match
   * the activation record exactly, including that this is still the token
   * currently on file (not one superseded by refresh/rotation/deactivation).
   */
  async resolveActivationToken(token: string): Promise<{ license: LicenseRow; activation: ActivationRow }> {
    const claims = await verifyActivationToken(this.config.jwtPublicKey, token);
    if (!claims) throw ApiError.unauthorized('Activation token is invalid or expired');

    const tokenHash = await sha256Hex(token);
    const blocked = await this.cache.get(`revoked_token:${tokenHash}`);
    if (blocked) throw ApiError.unauthorized('Activation token has been revoked');

    const license = await this.loadById(claims.license_id);
    if (!license) throw ApiError.notFound('License');
    const activation = await this.loadActivation(claims.sub);
    if (!activation) throw ApiError.notFound('Activation');

    const claimsMatch =
      activation.license_id === claims.license_id &&
      activation.organization_id === claims.org_id &&
      license.organization_id === claims.org_id &&
      license.product_id === claims.product_id &&
      activation.domain_normalized === claims.domain &&
      activation.installation_uuid === claims.installation_uuid &&
      activation.token_hash === tokenHash;
    if (!claimsMatch) throw ApiError.forbidden('Activation token is no longer valid for this installation');

    return { license, activation };
  }

  async buildValidationResponse(license: LicenseRow, activation: ActivationRow): Promise<LicenseValidationResponse> {
    const lifecycle = evaluateLicenseLifecycle(license);
    const activationUsable = activation.status === 'active';
    const valid = lifecycle.usable && activationUsable;
    const status: LicenseValidationResponse['status'] = !activationUsable ? 'activation_suspended' : lifecycle.effectiveStatus;

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

    const payload: Record<string, unknown> = {
      valid,
      status,
      grace_period_ends_at: lifecycle.gracePeriodEndsAt,
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

    const derivedKey = await deriveLicenseKey(this.config.signingSecret, license.key_hash);
    const signature = await signLicenseResponse(derivedKey, payload);
    return { ...payload, signature } as LicenseValidationResponse;
  }

  async logEvent(
    sql: Sql | TransactionSql,
    params: {
      licenseId: string;
      organizationId: string;
      eventType: string;
      actor: Actor;
      ip?: string | null;
      userAgent?: string | null;
      domain?: string | null;
      environment?: string | null;
      meta?: Record<string, unknown>;
    }
  ): Promise<void> {
    await sql`
      INSERT INTO license_events (license_id, organization_id, event_type, actor_type, actor_id, actor_email,
                                  ip_address, user_agent, domain, environment, metadata)
      VALUES (${params.licenseId}, ${params.organizationId}, ${params.eventType}, ${params.actor.type},
              ${params.actor.id ?? null}, ${params.actor.email ?? null}, ${params.ip ?? null}, ${params.userAgent ?? null},
              ${params.domain ?? null}, ${params.environment ?? null}, ${sql.json((params.meta ?? {}) as never)})`;
  }
}
