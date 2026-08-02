-- Licensing: licenses, activations, license events, website installations.
-- Raw keys are never stored — only SHA-256 hashes plus a display mask.

CREATE TABLE licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    plan_id UUID NOT NULL REFERENCES plans(id),
    subscription_id UUID REFERENCES subscriptions(id),
    key_hash VARCHAR(255) NOT NULL,     -- SHA-256 of the raw key
    key_prefix VARCHAR(20) NOT NULL,    -- e.g., 'insightistic_'
    key_mask VARCHAR(50) NOT NULL,      -- e.g., 'insightistic_****XXXX'
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'expired', 'revoked', 'transferred')),
    max_activations INTEGER DEFAULT 1,
    expires_at TIMESTAMPTZ,
    renewed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_licenses_updated_at BEFORE UPDATE ON licenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE license_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    website_id UUID REFERENCES websites(id),
    domain_normalized VARCHAR(255) NOT NULL,
    installation_uuid UUID NOT NULL,
    site_url TEXT,
    home_url TEXT,
    environment VARCHAR(20) DEFAULT 'production'
        CHECK (environment IN ('production', 'staging', 'development', 'local')),
    product_version VARCHAR(50),
    wp_version VARCHAR(50),
    php_version VARCHAR(20),
    first_activated_at TIMESTAMPTZ DEFAULT NOW(),
    last_checked_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'revoked')),
    deactivated_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(license_id, installation_uuid)
);
CREATE TRIGGER trg_license_activations_updated_at BEFORE UPDATE ON license_activations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE license_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE website_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    version VARCHAR(50),
    license_id UUID REFERENCES licenses(id),
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(website_id, product_id)
);
