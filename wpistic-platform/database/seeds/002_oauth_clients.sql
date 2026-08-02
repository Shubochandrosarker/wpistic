-- Pre-seeded OAuth clients for the launch applications.
-- SPA/public clients use PKCE and have no client secret.
-- Metadata drives branded login flows on account.wpistic.com.

INSERT INTO oauth_clients (client_id, name, redirect_uris, allowed_scopes, is_confidential, metadata) VALUES
  (
    'wpistic_dashboard',
    'WPistic Dashboard',
    '["https://app.wpistic.com/auth/callback", "http://localhost:5173/auth/callback"]',
    '["openid", "profile", "email", "org"]',
    FALSE,
    '{"accent": "#C9A961", "product": "wpistic", "display_name": "WPistic"}'
  ),
  (
    'wpistic_admin',
    'WPistic Admin Portal',
    '["https://admin.wpistic.com/auth/callback", "http://localhost:4321/auth/callback"]',
    '["openid", "profile", "email", "org", "admin"]',
    FALSE,
    '{"accent": "#C9A961", "product": "wpistic", "display_name": "WPistic Admin"}'
  ),
  (
    'chatbotistic',
    'Chatbotistic',
    '["https://app.chatbotistic.com/auth/callback"]',
    '["openid", "profile", "email", "org"]',
    FALSE,
    '{"accent": "#5B8DEF", "product": "chatbotistic", "display_name": "Chatbotistic"}'
  ),
  (
    'insightistic',
    'Insightistic',
    '["https://app.insightistic.com/auth/callback"]',
    '["openid", "profile", "email", "org"]',
    FALSE,
    '{"accent": "#34C77B", "product": "insightistic", "display_name": "Insightistic"}'
  ),
  (
    'tripistic',
    'Tripistic',
    '["https://app.tripistic.com/auth/callback"]',
    '["openid", "profile", "email", "org"]',
    FALSE,
    '{"accent": "#E8734A", "product": "tripistic", "display_name": "Tripistic"}'
  ),
  (
    'wpagentistic',
    'WP Agentistic',
    '["https://app.wpagentistic.com/auth/callback"]',
    '["openid", "profile", "email", "org"]',
    FALSE,
    '{"accent": "#9B6DFF", "product": "wpagentistic", "display_name": "WP Agentistic"}'
  )
ON CONFLICT (client_id) DO NOTHING;
