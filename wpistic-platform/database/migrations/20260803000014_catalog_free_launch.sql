-- PR #14: canonical free-launch catalog and first-class access grants.
-- Forward-only. Paid Stripe records remain partitioned from free claims.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS catalog_state VARCHAR(20) NOT NULL DEFAULT 'live'
    CHECK (catalog_state IN ('draft', 'coming_soon', 'beta', 'live', 'retired')),
  ADD COLUMN IF NOT EXISTS acquisition_mode VARCHAR(20) NOT NULL DEFAULT 'paid'
    CHECK (acquisition_mode IN ('free_claim', 'paid', 'invite_only', 'compliance_hold')),
  ADD COLUMN IF NOT EXISTS public_visibility BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS featured_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS free_limits JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS compliance_hold BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS free_plan_id UUID REFERENCES plans(id),
  ADD COLUMN IF NOT EXISTS default_release_channel VARCHAR(20) NOT NULL DEFAULT 'stable';

CREATE INDEX IF NOT EXISTS idx_products_public_catalog
  ON products (public_visibility, catalog_state, featured_order, name);

CREATE TABLE IF NOT EXISTS product_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  source VARCHAR(20) NOT NULL CHECK (source IN ('free_claim', 'subscription', 'bundle', 'manual', 'promotion', 'migration')),
  source_reference VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  limit_overrides JSONB NOT NULL DEFAULT '{}',
  idempotency_key VARCHAR(255) NOT NULL,
  created_by UUID REFERENCES users(id),
  revoked_by UUID REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_free_claim
  ON product_access_grants (organization_id, product_id)
  WHERE source = 'free_claim' AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_access_grants_org_status
  ON product_access_grants (organization_id, status);

CREATE TABLE IF NOT EXISTS configuration_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'validated', 'published', 'superseded', 'rolled_back')),
  snapshot JSONB NOT NULL,
  snapshot_hash VARCHAR(64) NOT NULL,
  created_by UUID REFERENCES users(id),
  published_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE (kind, snapshot_hash)
);

-- The old seed contained two historical products not in the canonical launch
-- catalog. Keep their rows for compatibility but prevent public acquisition.
UPDATE products
SET catalog_state = 'retired', acquisition_mode = 'paid', public_visibility = FALSE
WHERE slug IN ('tripistic', 'wpagentistic');

UPDATE products
SET catalog_state = 'coming_soon', acquisition_mode = 'compliance_hold', compliance_hold = TRUE,
    public_visibility = TRUE, free_plan_id = NULL
WHERE slug = 'ffl-checkout';
