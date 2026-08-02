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
