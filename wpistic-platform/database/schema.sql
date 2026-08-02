-- WPistic control plane — canonical schema.
-- GENERATED from database/migrations by `npm run schema`. Do not edit directly;
-- add a new timestamped migration instead.

-- ============================================================
-- 20260802000001_identity_tenancy.sql
-- ============================================================

-- Identity & tenancy: users, organizations, memberships, invitations,
-- sessions, trusted devices, security events.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared trigger: keep updated_at current on any UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified_at TIMESTAMPTZ,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url TEXT,
    mfa_secret VARCHAR(255),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_verified_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    login_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    avatar_url TEXT,
    billing_email VARCHAR(255),
    billing_address JSONB,
    tax_id VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE organization_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'billing_manager', 'product_manager', 'support_manager', 'member', 'viewer')),
    status VARCHAR(20) DEFAULT 'active',
    invited_by UUID REFERENCES users(id),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);
CREATE TRIGGER trg_org_memberships_updated_at BEFORE UPDATE ON organization_memberships
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE organization_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'member',
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(id),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    refresh_expires_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    device_fingerprint VARCHAR(255),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trusted_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, device_fingerprint)
);

CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 20260802000002_oauth_auth.sql
-- ============================================================

-- Auth-service tables: OAuth clients, authorization codes,
-- password reset tokens, MFA recovery codes.

CREATE TABLE oauth_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id VARCHAR(100) UNIQUE NOT NULL,
    client_secret_hash VARCHAR(255),
    name VARCHAR(100) NOT NULL,
    redirect_uris JSONB NOT NULL,
    allowed_scopes JSONB DEFAULT '["openid", "profile", "email", "org"]',
    is_confidential BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Authorization codes: 32-byte random raw value sent to the client,
-- SHA-256 hash stored here. PKCE challenge lives in KV (5 min TTL).
CREATE TABLE authorization_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id VARCHAR(100) NOT NULL,
    organization_id UUID REFERENCES organizations(id),
    redirect_uri TEXT NOT NULL,
    scope TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10 single-use bcrypt-hashed recovery codes generated at MFA setup.
CREATE TABLE mfa_recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 20260802000003_catalog.sql
-- ============================================================

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

-- ============================================================
-- 20260802000004_commercial.sql
-- ============================================================

-- Commercial ownership: subscriptions, orders, invoices, payments, coupons.
-- Everything belongs to an organization, never directly to a user.

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255) UNIQUE,
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'trialing', 'past_due', 'grace_period', 'paused', 'cancelled', 'expired', 'refunded', 'lifetime')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    cancelled_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE subscription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    plan_id UUID NOT NULL REFERENCES plans(id),
    price_id UUID NOT NULL REFERENCES prices(id),
    quantity INTEGER DEFAULT 1,
    stripe_subscription_item_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id),
    stripe_checkout_session_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
    total_amount INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    tax_amount INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    plan_id UUID REFERENCES plans(id),
    price_id UUID REFERENCES prices(id),
    quantity INTEGER DEFAULT 1,
    unit_amount INTEGER NOT NULL,
    total_amount INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id),
    order_id UUID REFERENCES orders(id),
    stripe_invoice_id VARCHAR(255) UNIQUE,
    amount_due INTEGER NOT NULL,
    amount_paid INTEGER DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'draft',
    pdf_url TEXT,
    due_date TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id),
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    amount INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'pending',
    failure_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    stripe_coupon_id VARCHAR(255),
    type VARCHAR(20) NOT NULL DEFAULT 'percentage'
        CHECK (type IN ('percentage', 'fixed_amount')),
    value INTEGER NOT NULL,
    max_redemptions INTEGER,
    redemption_count INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 20260802000005_websites.sql
-- ============================================================

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

-- ============================================================
-- 20260802000006_licensing.sql
-- ============================================================

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

-- ============================================================
-- 20260802000007_ai_credits.sql
-- ============================================================

-- AI credit wallet: append-only ledger + idempotent metered usage events.
-- The balance is never a mutable column; it is the ledger's running projection.

CREATE TABLE ai_credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    entry_type VARCHAR(20) NOT NULL
        CHECK (entry_type IN ('grant', 'consumption', 'refund', 'expiration', 'adjustment', 'renewal')),
    amount INTEGER NOT NULL,        -- positive for grant, negative for consumption
    balance_after INTEGER NOT NULL,
    reference_id VARCHAR(100),      -- subscription_id, usage_event_id, etc.
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    operation VARCHAR(100) NOT NULL,
    units INTEGER NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, idempotency_key)
);

-- ============================================================
-- 20260802000008_platform_ops.sql
-- ============================================================

-- Platform operations: notifications, support, audit logs, API keys,
-- webhook ingestion + outbound webhook subscriptions, feature flags.

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    body TEXT,
    action_url TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('in_app', 'email', 'push', 'sms')),
    category VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, channel, category)
);

CREATE TABLE support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    product_id UUID REFERENCES products(id),
    website_id UUID REFERENCES websites(id),
    license_id UUID REFERENCES licenses(id),
    subscription_id UUID REFERENCES subscriptions(id),
    subject VARCHAR(255) NOT NULL,
    body TEXT,
    severity VARCHAR(20) DEFAULT 'normal',
    category VARCHAR(50),
    status VARCHAR(20) DEFAULT 'open',
    assigned_to UUID,
    environment_details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_support_tickets_updated_at BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    is_internal BOOLEAN DEFAULT FALSE,
    body TEXT NOT NULL,
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    actor_type VARCHAR(20) DEFAULT 'user'
        CHECK (actor_type IN ('user', 'system', 'admin', 'webhook')),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    correlation_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_mask VARCHAR(50) NOT NULL,
    scopes JSONB DEFAULT '[]',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    event_type VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,      -- 'stripe', 'internal', etc.
    provider_event_id VARCHAR(255),     -- idempotency anchor (e.g. Stripe event id)
    payload JSONB NOT NULL,
    signature VARCHAR(255),
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, provider_event_id)
);

CREATE TABLE feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT FALSE,
    targeting_rules JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_feature_flags_updated_at BEFORE UPDATE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Outbound event delivery to product apps (Chatbotistic, Insightistic, ...).
CREATE TABLE webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    signing_secret VARCHAR(255) NOT NULL,
    event_types JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'active',
    failure_count INTEGER DEFAULT 0,
    last_delivery_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_webhook_subscriptions_updated_at BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 1,
    response_status INTEGER,
    error_message TEXT,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 20260802000009_indexes.sql
-- ============================================================

-- Performance indexes.

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_memberships_org ON organization_memberships(organization_id);
CREATE INDEX idx_memberships_user ON organization_memberships(user_id);
CREATE INDEX idx_invitations_org ON organization_invitations(organization_id);
CREATE INDEX idx_invitations_token ON organization_invitations(token_hash);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_refresh ON sessions(refresh_token_hash);
CREATE INDEX idx_security_events_user ON security_events(user_id, created_at);
CREATE INDEX idx_auth_codes_expires ON authorization_codes(expires_at);
CREATE INDEX idx_password_resets_user ON password_reset_tokens(user_id);
CREATE INDEX idx_plans_product ON plans(product_id);
CREATE INDEX idx_prices_plan ON prices(plan_id);
CREATE INDEX idx_features_product ON features(product_id);
CREATE INDEX idx_plan_entitlements_plan ON plan_entitlements(plan_id);
CREATE INDEX idx_releases_product_channel ON product_releases(product_id, channel, status);
CREATE INDEX idx_licenses_org ON licenses(organization_id);
CREATE INDEX idx_licenses_product ON licenses(product_id);
CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_licenses_key_hash ON licenses(key_hash);
CREATE INDEX idx_license_activations_license ON license_activations(license_id);
CREATE INDEX idx_license_activations_domain ON license_activations(domain_normalized);
CREATE INDEX idx_license_events_license ON license_events(license_id, created_at);
CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscription_items_sub ON subscription_items(subscription_id);
CREATE INDEX idx_orders_org ON orders(organization_id);
CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE INDEX idx_websites_org ON websites(organization_id);
CREATE INDEX idx_websites_domain ON websites(domain_normalized);
CREATE INDEX idx_installations_website ON website_installations(website_id);
CREATE INDEX idx_ai_ledger_org ON ai_credit_ledger(organization_id);
CREATE INDEX idx_ai_ledger_created ON ai_credit_ledger(created_at);
CREATE INDEX idx_ai_ledger_org_created ON ai_credit_ledger(organization_id, created_at DESC, id DESC);
CREATE INDEX idx_usage_events_idempotency ON usage_events(organization_id, idempotency_key);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_support_tickets_org ON support_tickets(organization_id, status);
CREATE INDEX idx_audit_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_webhooks_type ON webhook_events(event_type, processed_at);
CREATE INDEX idx_webhook_subs_status ON webhook_subscriptions(status);
CREATE INDEX idx_webhook_deliveries_sub ON webhook_deliveries(subscription_id, created_at DESC);

-- ============================================================
-- 20260802000010_row_level_security.sql
-- ============================================================

-- Row Level Security as a tenant-isolation safety net.
--
-- The primary isolation mechanism is application-level: every tenant query
-- includes organization_id, enforced by the API's tenantIsolation middleware.
-- RLS is defense-in-depth: the API sets app.current_org_id per request
-- (SELECT set_config('app.current_org_id', $1, true) inside a transaction);
-- if a query ever omits the org filter, the policy still constrains rows.
--
-- NOTE: RLS does not bind to the table owner or superusers. To make the net
-- effective in production, run the API under a dedicated non-owner role:
--   CREATE ROLE wpistic_app LOGIN PASSWORD '...';
--   GRANT USAGE ON SCHEMA public TO wpistic_app;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wpistic_app;
-- Admin/system paths connect as the owner role (or a role with BYPASSRLS).

CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('app.current_org_id', true), '')::UUID
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'licenses',
        'license_activations',
        'subscriptions',
        'orders',
        'invoices',
        'payments',
        'websites',
        'ai_credit_ledger',
        'usage_events',
        'support_tickets',
        'api_keys'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY org_isolation ON %I USING (organization_id = app_current_org_id())',
            t
        );
    END LOOP;
END $$;

-- ============================================================
-- 20260802000011_fix_phase2.sql
-- ============================================================

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

-- ============================================================
-- 20260803000012_phase4_hardening.sql
-- ============================================================

-- Phase 4: Completion, Security Hardening & Launch Readiness
-- Forward-only. Do not modify migrations 001–011.

-- ---------------------------------------------------------------------------
-- 1. License status reconciliation — backfill before any further use.
--    'transferred' was dropped from the CHECK constraint in migration 011;
--    reconcile any surviving rows to 'cancelled' before it's ever relied on.
-- ---------------------------------------------------------------------------
UPDATE licenses SET status = 'cancelled' WHERE status = 'transferred';

UPDATE licenses
SET revoked_reason = COALESCE(revoked_reason, 'unspecified')
WHERE status = 'revoked' AND revoked_reason IS NULL;

-- `revocation_reason` (006) and `revoked_reason` (011) are the same concept —
-- consolidate onto the newer column, the only one the application writes to.
UPDATE licenses SET revoked_reason = COALESCE(revoked_reason, revocation_reason) WHERE revocation_reason IS NOT NULL;
ALTER TABLE licenses DROP COLUMN IF EXISTS revocation_reason;

-- ---------------------------------------------------------------------------
-- 2. Activation status reconciliation — 'revoked' was dropped from the
--    license_activations CHECK constraint in migration 011; any surviving
--    rows must move to 'inactive' (the token is separately blocklisted by
--    the application) before being relied on as 'active'/'inactive'/'suspended'.
-- ---------------------------------------------------------------------------
UPDATE license_activations
SET status = 'inactive', deactivated_at = COALESCE(deactivated_at, NOW())
WHERE status NOT IN ('active', 'inactive', 'suspended');

-- ---------------------------------------------------------------------------
-- 3. Required fields & constraints
-- ---------------------------------------------------------------------------
UPDATE licenses SET max_activations = 1 WHERE max_activations IS NULL;
ALTER TABLE licenses ALTER COLUMN max_activations SET NOT NULL;

ALTER TABLE license_activations
    ADD COLUMN IF NOT EXISTS activation_meta JSONB NOT NULL DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- 4. Event outbox — created in 011; ensure it exists for environments that
--    diverged, and guarantee the unprocessed-work index is present.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5. license_events actor/domain columns were added nullable in 011; keep
--    historical rows well-formed for the new audit logger (section 2.7).
-- ---------------------------------------------------------------------------
UPDATE license_events SET actor_type = 'system' WHERE actor_type IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Websites: connection tokens issued before this migration used the old
--    64-hex `wct_` format; they remain valid (hash comparison is format
--    agnostic) but are re-issued on next connect/heartbeat cycle naturally.
--    display_domain backfill so existing rows render without a null cell.
-- ---------------------------------------------------------------------------
UPDATE websites SET display_domain = domain_normalized WHERE display_domain IS NULL;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security has no effect against the table owner/a superuser
--    (see migration 0010's note) — the API has always connected as such a
--    role, so RLS has never actually bound. Create the restricted role
--    migration 0010 asks for; production's Hyperdrive connection string must
--    be updated to use it (owner/superuser connections remain for admin
--    tooling and future migrations).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'wpistic_app') THEN
        CREATE ROLE wpistic_app NOLOGIN;
    ELSE
        ALTER ROLE wpistic_app NOLOGIN;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO wpistic_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wpistic_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wpistic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wpistic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO wpistic_app;

-- ============================================================
-- 20260803000013_download_grants.sql
-- ============================================================

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

-- ============================================================
-- 20260803000014_catalog_free_launch.sql
-- ============================================================

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

