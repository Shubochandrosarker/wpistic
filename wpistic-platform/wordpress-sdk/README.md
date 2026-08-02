# WPistic WordPress SDK

Shared licensing, activation, entitlement, and secure-update client for every
WPistic WordPress plugin (SEOistic, Memberistic, Bookingistic, Insightistic
plugin, …). One SDK, one behavior — never copy licensing code into a plugin.

## Install

```bash
composer require wpistic/wordpress-sdk
```

## Integrate (plugin main file)

`WpisticClient` is the SDK's one entry point — there is exactly one
documented, coherent way to integrate:

```php
use WPistic\Sdk\WpisticClient;

$seoistic = new WpisticClient( array(
    'product_slug'    => 'seoistic',
    'product_version' => SEOISTIC_VERSION,
    'plugin_file'     => __FILE__,
    // 'api_url'      => 'https://api.wpistic.com',     // default
    // 'account_url'  => 'https://account.wpistic.com', // default
) );
$seoistic->boot();
```

`boot()` wires everything: the twice-daily validation cron, the secure
update client, the license settings screen (Settings → SEOistic License)
with its "Connect to WPistic" account flow and manual-key fallback, and
grace-period admin notices.

## Gate features with entitlements — never plan names

```php
if ( $seoistic->entitlements()->allows( 'seoistic.pro.enabled' ) ) {
    // premium behavior
}

$max_sites = $seoistic->entitlements()->getMax( 'seoistic.sites.max' );

if ( $seoistic->entitlements()->isPro( 'seoistic' ) ) {
    // shorthand for allows( 'seoistic.pro.enabled' )
}
```

## What the SDK guarantees

- **Raw keys are never stored.** Activation exchanges the key for an
  activation token + a per-license verification key; only those persist,
  and both are encrypted at rest (AES-256-GCM, keyed by `wp_salt('auth')` —
  see `Security\TokenStorage`).
- **Offline verification.** Every platform response is HMAC-signed
  (hex HMAC-SHA256 over canonical JSON — see `Security\HmacVerifier`); the
  SDK verifies signatures locally with the per-license key, so a tampered
  or spoofed response is never trusted.
- **Grace-period resilience.** If api.wpistic.com is unreachable, premium
  features stay active for the configured grace period (default 7 days,
  server-authoritative) with an admin notice as it winds down — see
  `GracePeriodManager`. A server response is always authoritative over the
  offline grace math; the math only fills the gap when the API cannot be
  reached at all.
- **Consistent domain/environment reporting.** `DomainNormalizer` mirrors
  the platform's own normalization exactly, and the SDK sends its current
  domain, environment, and installation UUID on every validate call — the
  platform hard-rejects a mismatch.
- **Secure updates.** Update metadata is license-gated; packages are
  authorized just-in-time through short-lived, single-use signed URLs and
  are checksum-verified (SHA-256) before WordPress installs them —
  see `UpdateClient`.
- **WordPress-native security.** WordPress HTTP API with TLS verification,
  nonces on every admin action, `current_user_can( 'manage_options' )`
  gating, sanitized input, escaped output, keys redacted from logs.

## Metered AI usage (optional)

```php
$seoistic->api()->post( '/api/v1/usage/events', array(
    'product'          => 'seoistic',
    'operation'        => 'ai_content_optimization',
    'units'            => 4,
    'idempotency_key'  => wp_generate_uuid4(),
    'activation_token' => $seoistic->activation_token(),
) );
```

## Architecture

| Class | Responsibility |
| --- | --- |
| `WpisticClient` | Facade: `boot()`, `activate()`/`deactivate()`, `entitlements()`, `api()`, `status()`. |
| `LicenseManager` | Activate/validate/deactivate/refresh HTTP orchestration + encrypted state. |
| `EntitlementChecker` | Typed entitlement map reads: `allows()`, `getMax()`, `isPro()`, `value()`, `all()`. |
| `GracePeriodManager` | Offline-resilience math, with an injectable clock for testing. |
| `DomainNormalizer` | Domain normalization + environment detection, mirroring the platform exactly. |
| `Activation` | Installation UUID, normalized domain, environment, activation payload. |
| `UpdateClient` | Update checks, just-in-time download authorization, checksum verification. |
| `Security\TokenStorage` | AES-256-GCM at-rest encryption for everything persisted to `wp_options`. |
| `Security\HmacVerifier` | Offline signature verification (hex HMAC-SHA256, canonical JSON). |
| `Api\WpisticApi` | HTTP client (WordPress HTTP API), composes `Api\RetryHandler`. |
| `Api\RetryHandler` | Retry policy: network failure or 5xx only, capped exponential backoff. |
| `Admin\SettingsPage` | License settings screen: status, key entry, update channel, links. |
| `Admin\OnboardingWizard` | "Connect to WPistic" OAuth 2.1 + PKCE flow against account.wpistic.com. |

### Known follow-ups (not fabricated, flagged instead)

- The current license validate/activate response contract has no
  organization-name or activation-usage (`max_activations` /
  current-count) fields, so `SettingsPage` renders those as "not
  available" rather than guessing.
- `Admin\OnboardingWizard::exchange_code_for_activation()` performs the
  confirmed OAuth 2.1 + PKCE code→token exchange against
  account.wpistic.com's `/token` endpoint, but there is currently no
  endpoint that turns that generic account session into a
  product-specific WPistic `activation_token` (org + license selection).
  The manual license-key field remains the reliable activation path.
- `UpdateClient`'s download-authorize call requires the *raw* license key
  in its request body, which this SDK correctly never stores after
  activation — see `UpdateClient`'s class docblock for the exact tension
  and the `wpistic_{slug}_license_key_for_download` filter it exposes.
