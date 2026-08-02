-- Phase 5: single-use download grants moved from Workers KV to Postgres.
--
-- KV get-then-delete could not guarantee single use: two requests arriving
-- in the same tick could both read the grant before either delete landed.
-- A database row consumed with UPDATE ... WHERE used_at IS NULL RETURNING
-- is atomic — exactly one request wins, every other concurrent or later
-- attempt sees zero rows and is rejected.

CREATE TABLE IF NOT EXISTS download_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    package_path VARCHAR(500) NOT NULL,
    installation_uuid VARCHAR(64),
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index keeps expiry sweeps and consumption lookups cheap.
CREATE INDEX IF NOT EXISTS idx_download_grants_unused ON download_grants(expires_at) WHERE used_at IS NULL;
