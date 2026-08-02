/**
 * Canonical update/package service: `update_packages` joined with
 * `update_channels`. This is the only path for update checks and package
 * publishing — the legacy `product_releases` table (catalog module) is
 * retired in favor of this one.
 */
import type { Sql } from 'postgres';
import { ApiError } from '../../errors';
import { randomHex, sha256Hex } from '../../utils/crypto';
import { compareVersions, isNewerVersion } from '../../utils/semver';

export interface UpdatePackage {
  id: string;
  product_id: string;
  channel_id: string;
  version: string;
  release_notes: string | null;
  package_path: string;
  package_size_bytes: number | null;
  package_checksum: string;
  package_signature: string | null;
  min_php_version: string | null;
  min_wp_version: string | null;
  required_plan_id: string | null;
  rollout_percentage: number;
  is_security_release: boolean;
  is_forced: boolean;
  status: 'draft' | 'published' | 'rolled_back' | 'blocked';
  published_at: string | null;
  created_at: string;
}

interface CandidateRow extends UpdatePackage {
  required_plan_slug: string | null;
}

/** Deterministic rollout bucket in [0, 100) — same installation+version always lands in the same bucket. */
async function rolloutBucket(installationUuid: string, version: string): Promise<number> {
  const hash = await sha256Hex(`${installationUuid}:${version}`);
  return parseInt(hash.slice(0, 8), 16) % 100;
}

export class UpdatesService {
  constructor(private sql: Sql) {}

  /**
   * Highest published version newer than `currentVersion` that this
   * installation is eligible for: channel match (or a security release,
   * which crosses channels), php/wp minimums, and a deterministic rollout
   * bucket unless the release is forced.
   */
  async findAvailableUpdate(input: {
    productId: string;
    currentVersion: string;
    channel: string;
    installationUuid: string;
    phpVersion?: string;
    wpVersion?: string;
  }): Promise<CandidateRow | null> {
    const rows = await this.sql<CandidateRow[]>`
      SELECT up.id, up.product_id, up.channel_id, up.version, up.release_notes,
             up.package_path, up.package_size_bytes, up.package_checksum, up.package_signature,
             up.min_php_version, up.min_wp_version, up.required_plan_id,
             up.rollout_percentage, up.is_security_release, up.is_forced, up.status,
             up.published_at, up.created_at, pl.slug AS required_plan_slug
      FROM update_packages up
      JOIN update_channels uc ON uc.id = up.channel_id
      LEFT JOIN plans pl ON pl.id = up.required_plan_id
      WHERE up.product_id = ${input.productId}
        AND up.status = 'published'
        AND (uc.channel_name = ${input.channel} OR up.is_security_release = TRUE)
      ORDER BY up.version DESC`;

    const eligible: CandidateRow[] = [];
    for (const row of rows) {
      if (!isNewerVersion(row.version, input.currentVersion)) continue;
      if (row.min_php_version && input.phpVersion && compareVersions(input.phpVersion, row.min_php_version) < 0) continue;
      if (row.min_wp_version && input.wpVersion && compareVersions(input.wpVersion, row.min_wp_version) < 0) continue;
      if (!row.is_forced) {
        const bucket = await rolloutBucket(input.installationUuid, row.version);
        if (bucket >= row.rollout_percentage) continue;
      }
      eligible.push(row);
    }

    eligible.sort((a, b) => compareVersions(b.version, a.version));
    return eligible[0] ?? null;
  }

  async getPackage(id: string): Promise<UpdatePackage | null> {
    const rows = await this.sql<UpdatePackage[]>`
      SELECT id, product_id, channel_id, version, release_notes, package_path, package_size_bytes,
             package_checksum, package_signature, min_php_version, min_wp_version, required_plan_id,
             rollout_percentage, is_security_release, is_forced, status, published_at, created_at
      FROM update_packages WHERE id = ${id} LIMIT 1`;
    return rows[0] ?? null;
  }

  async ensureChannel(input: {
    productId: string;
    channelName: 'stable' | 'beta' | 'early_access' | 'internal' | 'security_hotfix';
  }): Promise<string> {
    const rows = await this.sql<{ id: string }[]>`
      INSERT INTO update_channels (product_id, channel_name)
      VALUES (${input.productId}, ${input.channelName})
      ON CONFLICT (product_id, channel_name) DO NOTHING
      RETURNING id`;
    if (rows[0]) return rows[0].id;
    const existing = await this.sql<{ id: string }[]>`
      SELECT id FROM update_channels WHERE product_id = ${input.productId} AND channel_name = ${input.channelName} LIMIT 1`;
    return existing[0]!.id;
  }

  /** Admin: register a package (draft) after it has been uploaded to R2 and its checksum verified. */
  async createPackage(input: {
    productId: string;
    channelId: string;
    version: string;
    releaseNotes?: string;
    packagePath: string;
    packageSizeBytes: number;
    packageChecksum: string;
    minPhpVersion?: string;
    minWpVersion?: string;
    requiredPlanId?: string;
    rolloutPercentage?: number;
    isSecurityRelease?: boolean;
    isForced?: boolean;
  }): Promise<UpdatePackage> {
    const rows = await this.sql<UpdatePackage[]>`
      INSERT INTO update_packages (
        product_id, channel_id, version, release_notes, package_path,
        package_size_bytes, package_checksum, min_php_version, min_wp_version, required_plan_id,
        rollout_percentage, is_security_release, is_forced, status
      ) VALUES (
        ${input.productId}, ${input.channelId}, ${input.version}, ${input.releaseNotes ?? null}, ${input.packagePath},
        ${input.packageSizeBytes}, ${input.packageChecksum}, ${input.minPhpVersion ?? null}, ${input.minWpVersion ?? null},
        ${input.requiredPlanId ?? null}, ${input.rolloutPercentage ?? 100}, ${input.isSecurityRelease ?? false},
        ${input.isForced ?? false}, 'draft'
      )
      ON CONFLICT (product_id, version)
      DO UPDATE SET release_notes = EXCLUDED.release_notes, package_path = EXCLUDED.package_path,
                    package_size_bytes = EXCLUDED.package_size_bytes, package_checksum = EXCLUDED.package_checksum,
                    min_php_version = EXCLUDED.min_php_version, min_wp_version = EXCLUDED.min_wp_version,
                    required_plan_id = EXCLUDED.required_plan_id, rollout_percentage = EXCLUDED.rollout_percentage,
                    is_security_release = EXCLUDED.is_security_release, is_forced = EXCLUDED.is_forced
      RETURNING id, product_id, channel_id, version, release_notes, package_path, package_size_bytes,
                package_checksum, package_signature, min_php_version, min_wp_version, required_plan_id,
                rollout_percentage, is_security_release, is_forced, status, published_at, created_at`;
    if (!rows[0]) throw new ApiError(500, 'internal_error', 'Failed to create update package');
    return rows[0];
  }

  async publish(id: string): Promise<UpdatePackage> {
    const rows = await this.sql<UpdatePackage[]>`
      UPDATE update_packages SET status = 'published', published_at = NOW()
      WHERE id = ${id}
      RETURNING id, product_id, channel_id, version, release_notes, package_path, package_size_bytes,
                package_checksum, package_signature, min_php_version, min_wp_version, required_plan_id,
                rollout_percentage, is_security_release, is_forced, status, published_at, created_at`;
    if (!rows[0]) throw ApiError.notFound('Package');
    return rows[0];
  }

  async rollback(id: string): Promise<UpdatePackage> {
    const rows = await this.sql<UpdatePackage[]>`
      UPDATE update_packages SET status = 'rolled_back'
      WHERE id = ${id}
      RETURNING id, product_id, channel_id, version, release_notes, package_path, package_size_bytes,
                package_checksum, package_signature, min_php_version, min_wp_version, required_plan_id,
                rollout_percentage, is_security_release, is_forced, status, published_at, created_at`;
    if (!rows[0]) throw ApiError.notFound('Package');
    return rows[0];
  }

  /** Published package for a product+version, gated on plan entitlement (spec 5.2). */
  async findDownloadablePackage(productId: string, version: string, licensePlanId: string): Promise<UpdatePackage> {
    const rows = await this.sql<UpdatePackage[]>`
      SELECT id, product_id, channel_id, version, release_notes, package_path, package_size_bytes,
             package_checksum, package_signature, min_php_version, min_wp_version, required_plan_id,
             rollout_percentage, is_security_release, is_forced, status, published_at, created_at
      FROM update_packages
      WHERE product_id = ${productId} AND version = ${version} AND status = 'published'
      LIMIT 1`;
    const pkg = rows[0];
    if (!pkg) throw ApiError.notFound('Package');
    if (pkg.required_plan_id && pkg.required_plan_id !== licensePlanId) {
      throw ApiError.forbidden('Your plan does not include this release — upgrade to download it');
    }
    return pkg;
  }
}

export interface DownloadGrant {
  license_id: string;
  product_id: string;
  version: string;
  package_path: string;
  org_id: string;
  installation_uuid?: string | null;
}

/**
 * Issue a single-use download grant (spec 5.2): opaque token, 15-minute TTL.
 * Only the SHA-256 of the token is stored, so a database leak cannot be
 * replayed into downloads.
 */
export async function createDownloadGrant(sql: Sql, grant: DownloadGrant, ttlSeconds: number): Promise<string> {
  const token = `dl_${randomHex(32)}`;
  const tokenHash = await sha256Hex(token);
  await sql`
    INSERT INTO download_grants (token_hash, license_id, product_id, organization_id, version, package_path, installation_uuid, expires_at)
    VALUES (${tokenHash}, ${grant.license_id}, ${grant.product_id}, ${grant.org_id}, ${grant.version},
            ${grant.package_path}, ${grant.installation_uuid ?? null}, NOW() + make_interval(secs => ${ttlSeconds}))`;
  return token;
}

/**
 * Resolve and consume a download grant (spec 5.3). Single-use is enforced
 * atomically in the database: UPDATE ... WHERE used_at IS NULL RETURNING
 * lets exactly one request flip the row to used — a concurrent replay
 * matches zero rows and is rejected, with no race window (unlike the KV
 * get-then-delete this replaced).
 */
export async function resolveDownloadGrant(sql: Sql, token: string): Promise<DownloadGrant> {
  const tokenHash = await sha256Hex(token);
  const rows = await sql<
    Array<{ license_id: string; product_id: string; organization_id: string; version: string; package_path: string; installation_uuid: string | null }>
  >`
    UPDATE download_grants
    SET used_at = NOW()
    WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > NOW()
    RETURNING license_id, product_id, organization_id, version, package_path, installation_uuid`;
  const row = rows[0];
  if (!row) throw new ApiError(403, 'unauthorized', 'Download token is invalid, expired, or already used');
  return {
    license_id: row.license_id,
    product_id: row.product_id,
    version: row.version,
    package_path: row.package_path,
    org_id: row.organization_id,
    installation_uuid: row.installation_uuid,
  };
}
