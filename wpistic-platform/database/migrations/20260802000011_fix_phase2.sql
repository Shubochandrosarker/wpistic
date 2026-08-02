-- Phase 2 Completion: Schema corrections, grace period, token revocation, updates, outbox
-- Do not modify migrations 001–010

-- 1. licenses table fixes
ALTER TABLE licenses
    ADD COLUMN IF NOT EXISTS max_websites INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS renews_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS license_type VARCHAR(20) NOT NULL DEFAULT 'product' CHECK (license_type IN ('product', 'ecosystem', 'bundle')),
    ADD COLUMN IF NOT EXISTS bundle_id UUID REFERENCES licenses(id),
    ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

-- Make key_hash unique if not already
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_licenses_key_hash_unique'
    ) THEN
        CREATE UNIQUE INDEX idx_licenses_key_hash_unique ON licenses(key_hash);
    END IF;
END $$;

-- Add cancelled status
ALTER TABLE licenses DROP CONSTRAINT IF EXISTS licenses_status_check;
ALTER TABLE licenses ADD CONSTRAINT licenses_status_check
    CHECK (status IN ('active', 'suspended', 'expired', 'revoked', 'cancelled'));

-- 2. license_activations fixes
ALTER TABLE license_activations
    ADD COLUMN IF NOT EXISTS token_hash VARCHAR(255),
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Fix status check to include suspended
ALTER TABLE license_activations DROP CONSTRAINT IF EXISTS license_activations_status_check;
ALTER TABLE license_activations ADD CONSTRAINT license_activations_status_check
    CHECK (status IN ('active', 'inactive', 'suspended'));

-- 3. websites fixes
ALTER TABLE websites
    ADD COLUMN IF NOT EXISTS connection_token_prefix VARCHAR(20),
    ADD COLUMN IF NOT EXISTS display_domain VARCHAR(255),
    ADD COLUMN IF NOT EXISTS connected_products JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS site_meta JSONB DEFAULT '{}';

-- Ensure token hash is unique
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_websites_token_hash_unique'
    ) THEN
        CREATE UNIQUE INDEX idx_websites_token_hash_unique ON websites(connection_token_hash);
    END IF;
END $$;

-- 4. license_events enrichment
ALTER TABLE license_events
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS actor_type VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'admin', 'system', 'plugin', 'webhook')),
    ADD COLUMN IF NOT EXISTS actor_id UUID,
    ADD COLUMN IF NOT EXISTS actor_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS ip_address INET,
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS domain VARCHAR(255),
    ADD COLUMN IF NOT EXISTS environment VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_license_events_org ON license_events(organization_id);

-- 5. update_channels table
CREATE TABLE IF NOT EXISTS update_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    channel_name VARCHAR(20) NOT NULL CHECK (channel_name IN ('stable', 'beta', 'early_access', 'internal', 'security_hotfix')),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, channel_name)
);

-- 6. update_packages table
CREATE TABLE IF NOT EXISTS update_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES update_channels(id),
    version VARCHAR(50) NOT NULL,
    release_notes TEXT,
    package_path VARCHAR(500) NOT NULL,
    package_size_bytes BIGINT,
    package_checksum VARCHAR(64) NOT NULL,
    package_signature VARCHAR(512),
    min_php_version VARCHAR(20),
    min_wp_version VARCHAR(20),
    required_plan_id UUID REFERENCES plans(id),
    rollout_percentage INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
    is_security_release BOOLEAN NOT NULL DEFAULT false,
    is_forced BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'rolled_back', 'blocked')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, version)
);

CREATE INDEX IF NOT EXISTS idx_packages_product ON update_packages(product_id);
CREATE INDEX IF NOT EXISTS idx_packages_channel ON update_packages(channel_id);

-- 7. outbox table for durable events
CREATE TABLE IF NOT EXISTS event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    processed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed ON event_outbox(processed_at, attempts) WHERE processed_at IS NULL;
