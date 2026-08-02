import type { Sql } from 'postgres';
import { ApiError } from '../../errors';

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

export class UpdatesService {
  constructor(private sql: Sql) {}

  async findAvailableUpdate(input: {
    productSlug: string;
    currentVersion: string;
    channel: string;
    phpVersion?: string;
    wpVersion?: string;
  }): Promise<UpdatePackage | null> {
    const rows = await this.sql<UpdatePackage[]>`
      SELECT up.id, up.product_id, up.channel_id, up.version, up.release_notes,
             up.package_path, up.package_size_bytes, up.package_checksum, up.package_signature,
             up.min_php_version, up.min_wp_version, up.required_plan_id,
             up.rollout_percentage, up.is_security_release, up.is_forced, up.status,
             up.published_at, up.created_at
      FROM update_packages up
      JOIN update_channels uc ON uc.id = up.channel_id
      JOIN products p ON p.id = up.product_id
      WHERE p.slug = ${input.productSlug}
        AND uc.channel_name = ${input.channel}
        AND up.status = 'published'
        AND up.version > ${input.currentVersion}
        AND (up.min_php_version IS NULL OR up.min_php_version <= ${input.phpVersion ?? null})
        AND (up.min_wp_version IS NULL OR up.min_wp_version <= ${input.wpVersion ?? null})
      ORDER BY up.version DESC
      LIMIT 1`;

    return rows[0] ?? null;
  }

  async createUpdateChannel(input: {
    productId: string;
    channelName: 'stable' | 'beta' | 'early_access' | 'internal' | 'security_hotfix';
    isDefault?: boolean;
  }): Promise<string> {
    const rows = await this.sql<{ id: string }[]>`
      INSERT INTO update_channels (product_id, channel_name, is_default)
      VALUES (${input.productId}, ${input.channelName}, ${input.isDefault ?? false})
      ON CONFLICT (product_id, channel_name) DO NOTHING
      RETURNING id`;

    if (!rows[0]) {
      const existing = await this.sql<{ id: string }[]>`
        SELECT id FROM update_channels
        WHERE product_id = ${input.productId} AND channel_name = ${input.channelName}
        LIMIT 1`;
      return existing[0]?.id ?? '';
    }

    return rows[0].id;
  }

  async publishUpdatePackage(input: {
    productId: string;
    channelId: string;
    version: string;
    releaseNotes?: string;
    packagePath: string;
    packageSizeBytes?: number;
    packageChecksum: string;
    packageSignature?: string;
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
        package_size_bytes, package_checksum, package_signature,
        min_php_version, min_wp_version, required_plan_id,
        rollout_percentage, is_security_release, is_forced,
        status, published_at
      ) VALUES (
        ${input.productId}, ${input.channelId}, ${input.version},
        ${input.releaseNotes ?? null}, ${input.packagePath},
        ${input.packageSizeBytes ?? null}, ${input.packageChecksum},
        ${input.packageSignature ?? null}, ${input.minPhpVersion ?? null},
        ${input.minWpVersion ?? null}, ${input.requiredPlanId ?? null},
        ${input.rolloutPercentage ?? 100}, ${input.isSecurityRelease ?? false},
        ${input.isForced ?? false}, 'published', NOW()
      )
      ON CONFLICT (product_id, version)
      DO UPDATE SET status = 'published', published_at = NOW()
      RETURNING id, product_id, channel_id, version, release_notes, package_path,
                package_size_bytes, package_checksum, package_signature,
                min_php_version, min_wp_version, required_plan_id,
                rollout_percentage, is_security_release, is_forced, status,
                published_at, created_at`;

    if (!rows[0]) throw new ApiError(500, 'internal_error', 'Failed to create update package');
    return rows[0];
  }
}
