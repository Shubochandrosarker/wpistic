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
        CREATE ROLE wpistic_app LOGIN PASSWORD 'change-me-in-production';
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO wpistic_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wpistic_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wpistic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wpistic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO wpistic_app;
