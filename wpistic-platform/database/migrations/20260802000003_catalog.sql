-- Product catalog: products, plans, prices, features, plan entitlements,
-- bundles, and product releases (update/download service).

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url TEXT,
    app_url VARCHAR(255),        -- e.g., https://app.chatbotistic.com
    marketing_url VARCHAR(255),  -- e.g., https://chatbotistic.com
    type VARCHAR(20) NOT NULL DEFAULT 'saas'
        CHECK (type IN ('saas', 'plugin', 'bundle', 'addon')),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    slug VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, slug)
);
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON plans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- interval NULL is allowed (one-time price); CHECK passes on NULL by SQL semantics.
CREATE TABLE prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    stripe_price_id VARCHAR(255) UNIQUE,
    amount INTEGER NOT NULL,        -- in cents
    currency VARCHAR(3) DEFAULT 'USD',
    interval VARCHAR(20)
        CHECK (interval IN ('month', 'year', 'lifetime')),
    trial_days INTEGER DEFAULT 0,
    is_default BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,      -- e.g., 'chatbotistic.agents.max'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(20) DEFAULT 'boolean'
        CHECK (type IN ('boolean', 'number', 'string', 'list')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, key)
);

CREATE TABLE plan_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    value JSONB NOT NULL,           -- stores boolean, number, or string
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(plan_id, feature_id)
);

CREATE TABLE bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bundle_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id),  -- optional: force specific plan
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bundle_id, product_id)
);

-- Release metadata backing GET /api/v1/products/{slug}/updates and the
-- short-lived signed download flow. package_key points at the R2 object.
CREATE TABLE product_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'stable'
        CHECK (channel IN ('stable', 'beta', 'early_access', 'internal', 'hotfix')),
    requires_php VARCHAR(20),
    requires_wp VARCHAR(20),
    tested_up_to VARCHAR(20),
    changelog_url TEXT,
    package_key TEXT NOT NULL,
    package_hash VARCHAR(100),
    package_size BIGINT,
    is_security_release BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'rolled_back', 'blocked')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, version, channel)
);
CREATE TRIGGER trg_product_releases_updated_at BEFORE UPDATE ON product_releases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
