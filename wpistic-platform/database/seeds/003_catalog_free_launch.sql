-- Canonical 15-product launch catalog. Existing historical rows are updated
-- in place; this file is idempotent and never creates FFL entitlements.

INSERT INTO products (slug, name, description, type, app_url, marketing_url)
VALUES
  ('formistic', 'Formistic', 'Build campaign and operational forms that feed replies, analytics, and automations.', 'plugin', NULL, 'https://formistic.wpistic.com'),
  ('postistic', 'Postistic', 'Plan, import, optimize, and schedule WordPress content with AI-assisted editorial workflows.', 'plugin', NULL, 'https://postistic.wpistic.com'),
  ('crmistic', 'CRMistic', 'Manage relationships with booking, membership, form, and communication context in one WordPress CRM.', 'plugin', NULL, 'https://crmistic.wpistic.com'),
  ('licenseistic', 'Licenseistic', 'Sell and manage licensed WordPress products with activation tracking and entitlement-aware access.', 'plugin', NULL, 'https://licenseistic.wpistic.com'),
  ('wpistic-ai-bridge', 'WPistic AI Bridge', 'Connect WordPress features to approved AI providers through a signed, quota-aware gateway.', 'plugin', NULL, 'https://wpistic-ai-bridge.wpistic.com'),
  ('messageistic', 'Messageistic', 'Send customer messages, route conversations, and connect notifications to WordPress workflows.', 'plugin', NULL, 'https://messageistic.wpistic.com'),
  ('ffl-checkout', 'FFL Checkout', 'Compliance-held catalog entry for a separately reviewed regulated commerce workflow.', 'plugin', NULL, 'https://wpistic.com/products/ffl-checkout'),
  ('scheduleistic', 'Scheduleistic', 'Schedule social content with AI-assisted workflows to save time and maintain consistency.', 'saas', 'https://app.scheduleistic.com', 'https://scheduleistic.com'),
  ('mailistic', 'Mailistic', 'Run email campaigns from WordPress data with consent, suppression, analytics, and automations.', 'plugin', NULL, 'https://mailistic.wpistic.com'),
  ('verifyistic', 'Verifyistic', 'Collect proof, review verification status, and organize trust workflows in WordPress.', 'plugin', NULL, 'https://verifyistic.wpistic.com')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
  type = EXCLUDED.type, app_url = EXCLUDED.app_url, marketing_url = EXCLUDED.marketing_url;

INSERT INTO plans (product_id, slug, name, description, is_public, sort_order, status)
SELECT p.id, 'free', 'Free', 'Card-free access to the core product', TRUE, 0, 'active'
FROM products p
WHERE p.slug IN ('memberistic', 'insightistic', 'bookingistic', 'formistic', 'postistic', 'crmistic',
                 'licenseistic', 'wpistic-ai-bridge', 'messageistic', 'chatbotistic', 'scheduleistic',
                 'mailistic', 'verifyistic', 'seoistic')
ON CONFLICT (product_id, slug) DO NOTHING;

INSERT INTO features (product_id, key, name, type)
SELECT p.id, p.slug || '.sites.max', 'Connected sites', 'number'
FROM products p
WHERE p.slug IN ('memberistic', 'insightistic', 'bookingistic', 'formistic', 'postistic', 'crmistic',
                 'licenseistic', 'wpistic-ai-bridge', 'messageistic', 'chatbotistic', 'scheduleistic',
                 'mailistic', 'verifyistic', 'seoistic')
ON CONFLICT (product_id, key) DO NOTHING;

INSERT INTO plan_entitlements (plan_id, feature_id, value)
SELECT pl.id, f.id, CASE p.slug
  WHEN 'crmistic' THEN '250'
  WHEN 'mailistic' THEN '1'
  ELSE '1'
END::jsonb
FROM products p
JOIN plans pl ON pl.product_id = p.id AND pl.slug = 'free'
JOIN features f ON f.product_id = p.id AND f.key = p.slug || '.sites.max'
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- Free-claimable products. The join to the `free` plan is what makes this
-- correct *and* what makes it silently skip anything without one — which is
-- why ffl-checkout, tripistic, and wpagentistic are handled separately below
-- rather than with a CASE branch in here that could never be reached.
UPDATE products p
SET catalog_state = 'live',
    acquisition_mode = 'free_claim',
    compliance_hold = FALSE,
    public_visibility = TRUE,
    free_plan_id = pl.id,
    free_limits = CASE p.slug
      WHEN 'memberistic' THEN '{"sites":1,"members":100}'::jsonb
      WHEN 'insightistic' THEN '{"sites":1,"reporting_days":30,"ai_insights_monthly":25}'::jsonb
      WHEN 'bookingistic' THEN '{"calendars":1,"bookings_monthly":50}'::jsonb
      WHEN 'formistic' THEN '{"forms":3,"submissions_monthly":250}'::jsonb
      WHEN 'postistic' THEN '{"sites":1,"scheduled_items_monthly":30,"ai_monthly":25}'::jsonb
      WHEN 'crmistic' THEN '{"contacts":250,"pipelines":1}'::jsonb
      WHEN 'licenseistic' THEN '{"managed_products":1,"active_licenses":100,"sites_per_license":1}'::jsonb
      WHEN 'wpistic-ai-bridge' THEN '{"provider_connections":1,"requests_monthly":1000}'::jsonb
      WHEN 'messageistic' THEN '{"channels":1,"messages_monthly":250}'::jsonb
      WHEN 'chatbotistic' THEN '{"agents":1,"conversations_monthly":100}'::jsonb
      WHEN 'scheduleistic' THEN '{"social_profiles":2,"scheduled_posts_monthly":30}'::jsonb
      WHEN 'mailistic' THEN '{"contacts":250,"sends_monthly":500,"consent_required":true}'::jsonb
      WHEN 'verifyistic' THEN '{"workflows":1,"submissions_monthly":100}'::jsonb
      WHEN 'seoistic' THEN '{"sites":1,"ai_monthly":25}'::jsonb
      ELSE p.free_limits
    END
FROM plans pl
WHERE pl.product_id = p.id AND pl.slug = 'free';

-- ---------------------------------------------------------------------------
-- Products with no free plan. These cannot be reached by the join above, so
-- they are set explicitly. Migration 014 carries the same corrections for
-- databases seeded before it existed; on a fresh database these are the ones
-- that actually take effect, because seeds run after every migration.
-- ---------------------------------------------------------------------------

-- Regulated commerce: visible in the catalog as coming soon, acquirable by
-- nobody, and holding no free plan to hand out.
UPDATE products
SET catalog_state = 'coming_soon',
    acquisition_mode = 'compliance_hold',
    compliance_hold = TRUE,
    public_visibility = TRUE,
    free_plan_id = NULL,
    free_limits = '{}'::jsonb
WHERE slug = 'ffl-checkout';

-- Historical products from the pre-launch seed, kept for referential integrity
-- with any existing rows but out of the public catalog entirely.
UPDATE products
SET catalog_state = 'retired',
    acquisition_mode = 'paid',
    compliance_hold = FALSE,
    public_visibility = FALSE,
    free_plan_id = NULL
WHERE slug IN ('tripistic', 'wpagentistic');
