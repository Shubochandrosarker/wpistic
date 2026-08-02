-- Seed the product catalog: the seven launch products, their plans, prices,
-- features, plan entitlements, and the all-access bundle. Idempotent.

INSERT INTO products (slug, name, description, type, app_url, marketing_url) VALUES
  ('chatbotistic', 'Chatbotistic', 'AI chat agents, inbox, and customer conversations', 'saas', 'https://app.chatbotistic.com', 'https://chatbotistic.com'),
  ('insightistic', 'Insightistic', 'Website, SEO, performance, and WooCommerce analytics', 'saas', 'https://app.insightistic.com', 'https://insightistic.com'),
  ('seoistic', 'SEOistic', 'WordPress SEO toolkit with AI content optimization', 'plugin', NULL, 'https://seoistic.wpistic.com'),
  ('memberistic', 'Memberistic', 'WordPress memberships, subscriptions, and gated content', 'plugin', NULL, 'https://memberistic.wpistic.com'),
  ('bookingistic', 'Bookingistic', 'WordPress bookings, calendars, and appointments', 'plugin', NULL, 'https://bookingistic.wpistic.com'),
  ('tripistic', 'Tripistic', 'Tour and travel operator management platform', 'saas', 'https://app.tripistic.com', 'https://tripistic.com'),
  ('wpagentistic', 'WP Agentistic', 'AI agents that operate and maintain WordPress sites', 'saas', 'https://app.wpagentistic.com', 'https://wpagentistic.com')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO plans (product_id, slug, name, description, sort_order)
SELECT p.id, v.slug, v.name, v.description, v.sort_order
FROM (VALUES
  ('chatbotistic', 'free',         'Free',         'Get started with one agent',              0),
  ('chatbotistic', 'starter',      'Starter',      'For small teams starting with AI chat',   1),
  ('chatbotistic', 'professional', 'Professional', 'Growing teams and multiple agents',       2),
  ('chatbotistic', 'agency',       'Agency',       'White-label, high limits, client work',   3),
  ('insightistic', 'starter',      'Starter',      'Analytics for a single site',             1),
  ('insightistic', 'professional', 'Professional', 'Multi-site analytics with AI insights',   2),
  ('insightistic', 'agency',       'Agency',       'Agency-scale analytics portfolio',        3),
  ('seoistic',     'free',         'Free',         'Core SEO toolkit',                        0),
  ('seoistic',     'starter',      'Starter',      'Pro SEO for one site',                    1),
  ('seoistic',     'professional', 'Professional', 'Pro SEO with AI credits for five sites',  2),
  ('seoistic',     'agency',       'Agency',       'Agency license for 25 sites',             3),
  ('memberistic',  'free',         'Free',         'Basic memberships',                       0),
  ('memberistic',  'starter',      'Starter',      'Paid memberships for one site',           1),
  ('memberistic',  'professional', 'Professional', 'Advanced memberships and integrations',   2),
  ('memberistic',  'agency',       'Agency',       'Agency license for client sites',         3),
  ('bookingistic', 'free',         'Free',         'Simple booking forms',                    0),
  ('bookingistic', 'starter',      'Starter',      'Bookings for one site',                   1),
  ('bookingistic', 'professional', 'Professional', 'Advanced calendars and payments',         2),
  ('bookingistic', 'agency',       'Agency',       'Agency license for client sites',         3),
  ('tripistic',    'starter',      'Starter',      'Small operators',                         1),
  ('tripistic',    'professional', 'Professional', 'Growing tour businesses',                 2),
  ('tripistic',    'agency',       'Agency',       'Multi-operator management',               3),
  ('wpagentistic', 'starter',      'Starter',      'One AI agent, one site',                  1),
  ('wpagentistic', 'professional', 'Professional', 'Agents across your portfolio',            2),
  ('wpagentistic', 'agency',       'Agency',       'Full agency automation',                  3)
) AS v(product_slug, slug, name, description, sort_order)
JOIN products p ON p.slug = v.product_slug
ON CONFLICT (product_id, slug) DO NOTHING;

INSERT INTO prices (plan_id, amount, currency, interval, is_default)
SELECT pl.id, v.amount, 'USD', v.billing_interval, v.is_default
FROM (VALUES
  ('starter',       900, 'month', TRUE),
  ('starter',      9000, 'year',  FALSE),
  ('professional', 2900, 'month', TRUE),
  ('professional',29000, 'year',  FALSE),
  ('agency',       9900, 'month', TRUE),
  ('agency',      99000, 'year',  FALSE)
) AS v(plan_slug, amount, billing_interval, is_default)
JOIN plans pl ON pl.slug = v.plan_slug
WHERE NOT EXISTS (
  SELECT 1 FROM prices pr
  WHERE pr.plan_id = pl.id AND pr.interval = v.billing_interval AND pr.amount = v.amount
);

INSERT INTO features (product_id, key, name, type)
SELECT p.id, v.key, v.name, v.type
FROM (VALUES
  ('chatbotistic', 'chatbotistic.agents.max',          'Max AI agents',            'number'),
  ('chatbotistic', 'chatbotistic.contacts.max',        'Max contacts',             'number'),
  ('chatbotistic', 'chatbotistic.white_label',         'White label',              'boolean'),
  ('chatbotistic', 'chatbotistic.channels.whatsapp',   'WhatsApp channel',         'boolean'),
  ('insightistic', 'insightistic.sites.max',           'Max connected sites',      'number'),
  ('insightistic', 'insightistic.ai.monthly_credits',  'Monthly AI credits',       'number'),
  ('insightistic', 'insightistic.woocommerce.enabled', 'WooCommerce analytics',    'boolean'),
  ('insightistic', 'insightistic.pro.enabled',         'Pro features',             'boolean'),
  ('seoistic',     'seoistic.pro.enabled',             'Pro features',             'boolean'),
  ('seoistic',     'seoistic.sites.max',               'Max activated sites',      'number'),
  ('seoistic',     'seoistic.ai.monthly_credits',      'Monthly AI credits',       'number'),
  ('seoistic',     'seoistic.schema.advanced',         'Advanced schema markup',   'boolean'),
  ('memberistic',  'memberistic.pro.enabled',          'Pro features',             'boolean'),
  ('memberistic',  'memberistic.sites.max',            'Max activated sites',      'number'),
  ('memberistic',  'memberistic.members.max',          'Max members',              'number'),
  ('bookingistic', 'bookingistic.pro.enabled',         'Pro features',             'boolean'),
  ('bookingistic', 'bookingistic.sites.max',           'Max activated sites',      'number'),
  ('bookingistic', 'bookingistic.calendars.max',       'Max calendars',            'number'),
  ('tripistic',    'tripistic.pro.enabled',            'Pro features',             'boolean'),
  ('tripistic',    'tripistic.bookings.monthly_max',   'Monthly bookings',         'number'),
  ('wpagentistic', 'wpagentistic.pro.enabled',         'Pro features',             'boolean'),
  ('wpagentistic', 'wpagentistic.agents.max',          'Max AI agents',            'number'),
  ('wpagentistic', 'wpagentistic.sites.max',           'Max managed sites',        'number')
) AS v(product_slug, key, name, type)
JOIN products p ON p.slug = v.product_slug
ON CONFLICT (product_id, key) DO NOTHING;

-- Plan entitlements: value column is JSONB (booleans and numbers).
INSERT INTO plan_entitlements (plan_id, feature_id, value)
SELECT pl.id, f.id, v.value::jsonb
FROM (VALUES
  ('chatbotistic', 'free',         'chatbotistic.agents.max',          '1'),
  ('chatbotistic', 'free',         'chatbotistic.contacts.max',        '200'),
  ('chatbotistic', 'free',         'chatbotistic.white_label',         'false'),
  ('chatbotistic', 'free',         'chatbotistic.channels.whatsapp',   'false'),
  ('chatbotistic', 'starter',      'chatbotistic.agents.max',          '3'),
  ('chatbotistic', 'starter',      'chatbotistic.contacts.max',        '2000'),
  ('chatbotistic', 'starter',      'chatbotistic.white_label',         'false'),
  ('chatbotistic', 'starter',      'chatbotistic.channels.whatsapp',   'false'),
  ('chatbotistic', 'professional', 'chatbotistic.agents.max',          '10'),
  ('chatbotistic', 'professional', 'chatbotistic.contacts.max',        '20000'),
  ('chatbotistic', 'professional', 'chatbotistic.white_label',         'false'),
  ('chatbotistic', 'professional', 'chatbotistic.channels.whatsapp',   'true'),
  ('chatbotistic', 'agency',       'chatbotistic.agents.max',          '50'),
  ('chatbotistic', 'agency',       'chatbotistic.contacts.max',        '200000'),
  ('chatbotistic', 'agency',       'chatbotistic.white_label',         'true'),
  ('chatbotistic', 'agency',       'chatbotistic.channels.whatsapp',   'true'),
  ('insightistic', 'starter',      'insightistic.sites.max',           '1'),
  ('insightistic', 'starter',      'insightistic.ai.monthly_credits',  '100'),
  ('insightistic', 'starter',      'insightistic.woocommerce.enabled', 'false'),
  ('insightistic', 'starter',      'insightistic.pro.enabled',         'true'),
  ('insightistic', 'professional', 'insightistic.sites.max',           '5'),
  ('insightistic', 'professional', 'insightistic.ai.monthly_credits',  '500'),
  ('insightistic', 'professional', 'insightistic.woocommerce.enabled', 'true'),
  ('insightistic', 'professional', 'insightistic.pro.enabled',         'true'),
  ('insightistic', 'agency',       'insightistic.sites.max',           '25'),
  ('insightistic', 'agency',       'insightistic.ai.monthly_credits',  '2500'),
  ('insightistic', 'agency',       'insightistic.woocommerce.enabled', 'true'),
  ('insightistic', 'agency',       'insightistic.pro.enabled',         'true'),
  ('seoistic',     'free',         'seoistic.pro.enabled',             'false'),
  ('seoistic',     'free',         'seoistic.sites.max',               '1'),
  ('seoistic',     'free',         'seoistic.ai.monthly_credits',      '0'),
  ('seoistic',     'free',         'seoistic.schema.advanced',         'false'),
  ('seoistic',     'starter',      'seoistic.pro.enabled',             'true'),
  ('seoistic',     'starter',      'seoistic.sites.max',               '1'),
  ('seoistic',     'starter',      'seoistic.ai.monthly_credits',      '100'),
  ('seoistic',     'starter',      'seoistic.schema.advanced',         'false'),
  ('seoistic',     'professional', 'seoistic.pro.enabled',             'true'),
  ('seoistic',     'professional', 'seoistic.sites.max',               '5'),
  ('seoistic',     'professional', 'seoistic.ai.monthly_credits',      '500'),
  ('seoistic',     'professional', 'seoistic.schema.advanced',         'true'),
  ('seoistic',     'agency',       'seoistic.pro.enabled',             'true'),
  ('seoistic',     'agency',       'seoistic.sites.max',               '25'),
  ('seoistic',     'agency',       'seoistic.ai.monthly_credits',      '2000'),
  ('seoistic',     'agency',       'seoistic.schema.advanced',         'true'),
  ('memberistic',  'free',         'memberistic.pro.enabled',          'false'),
  ('memberistic',  'free',         'memberistic.sites.max',            '1'),
  ('memberistic',  'free',         'memberistic.members.max',          '100'),
  ('memberistic',  'starter',      'memberistic.pro.enabled',          'true'),
  ('memberistic',  'starter',      'memberistic.sites.max',            '1'),
  ('memberistic',  'starter',      'memberistic.members.max',          '1000'),
  ('memberistic',  'professional', 'memberistic.pro.enabled',          'true'),
  ('memberistic',  'professional', 'memberistic.sites.max',            '5'),
  ('memberistic',  'professional', 'memberistic.members.max',          '10000'),
  ('memberistic',  'agency',       'memberistic.pro.enabled',          'true'),
  ('memberistic',  'agency',       'memberistic.sites.max',            '25'),
  ('memberistic',  'agency',       'memberistic.members.max',          '100000'),
  ('bookingistic', 'free',         'bookingistic.pro.enabled',         'false'),
  ('bookingistic', 'free',         'bookingistic.sites.max',           '1'),
  ('bookingistic', 'free',         'bookingistic.calendars.max',       '1'),
  ('bookingistic', 'starter',      'bookingistic.pro.enabled',         'true'),
  ('bookingistic', 'starter',      'bookingistic.sites.max',           '1'),
  ('bookingistic', 'starter',      'bookingistic.calendars.max',       '3'),
  ('bookingistic', 'professional', 'bookingistic.pro.enabled',         'true'),
  ('bookingistic', 'professional', 'bookingistic.sites.max',           '5'),
  ('bookingistic', 'professional', 'bookingistic.calendars.max',       '20'),
  ('bookingistic', 'agency',       'bookingistic.pro.enabled',         'true'),
  ('bookingistic', 'agency',       'bookingistic.sites.max',           '25'),
  ('bookingistic', 'agency',       'bookingistic.calendars.max',       '100'),
  ('tripistic',    'starter',      'tripistic.pro.enabled',            'true'),
  ('tripistic',    'starter',      'tripistic.bookings.monthly_max',   '100'),
  ('tripistic',    'professional', 'tripistic.pro.enabled',            'true'),
  ('tripistic',    'professional', 'tripistic.bookings.monthly_max',   '1000'),
  ('tripistic',    'agency',       'tripistic.pro.enabled',            'true'),
  ('tripistic',    'agency',       'tripistic.bookings.monthly_max',   '10000'),
  ('wpagentistic', 'starter',      'wpagentistic.pro.enabled',         'true'),
  ('wpagentistic', 'starter',      'wpagentistic.agents.max',          '1'),
  ('wpagentistic', 'starter',      'wpagentistic.sites.max',           '1'),
  ('wpagentistic', 'professional', 'wpagentistic.pro.enabled',         'true'),
  ('wpagentistic', 'professional', 'wpagentistic.agents.max',          '5'),
  ('wpagentistic', 'professional', 'wpagentistic.sites.max',           '10'),
  ('wpagentistic', 'agency',       'wpagentistic.pro.enabled',         'true'),
  ('wpagentistic', 'agency',       'wpagentistic.agents.max',          '25'),
  ('wpagentistic', 'agency',       'wpagentistic.sites.max',           '50')
) AS v(product_slug, plan_slug, feature_key, value)
JOIN products p ON p.slug = v.product_slug
JOIN plans pl ON pl.product_id = p.id AND pl.slug = v.plan_slug
JOIN features f ON f.product_id = p.id AND f.key = v.feature_key
ON CONFLICT (plan_id, feature_id) DO NOTHING;

INSERT INTO bundles (slug, name, description) VALUES
  ('wpistic-all-access', 'WPistic All Access', 'Every WPistic product, one subscription')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO bundle_products (bundle_id, product_id, plan_id)
SELECT b.id, p.id, pl.id
FROM bundles b
JOIN products p ON p.slug IN ('chatbotistic', 'insightistic', 'seoistic', 'memberistic', 'bookingistic', 'tripistic', 'wpagentistic')
JOIN plans pl ON pl.product_id = p.id AND pl.slug = 'agency'
WHERE b.slug = 'wpistic-all-access'
ON CONFLICT (bundle_id, product_id) DO NOTHING;
