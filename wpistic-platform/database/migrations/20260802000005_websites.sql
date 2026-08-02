-- Cross-product website registry. Created before licensing because
-- license_activations references websites(id).

CREATE TABLE websites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    domain_normalized VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    environment VARCHAR(20) DEFAULT 'production',
    wp_version VARCHAR(50),
    php_version VARCHAR(20),
    is_connected BOOLEAN DEFAULT FALSE,
    connection_token_hash VARCHAR(255),
    last_sync_at TIMESTAMPTZ,
    health_status VARCHAR(20) DEFAULT 'unknown',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, domain_normalized)
);
CREATE TRIGGER trg_websites_updated_at BEFORE UPDATE ON websites
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
