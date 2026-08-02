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
