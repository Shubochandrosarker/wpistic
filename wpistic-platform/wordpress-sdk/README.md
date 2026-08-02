# WPistic WordPress SDK

Shared licensing, activation, entitlement, and secure-update client for every
WPistic WordPress plugin (SEOistic, Memberistic, Bookingistic, Insightistic
plugin, …). One SDK, one behavior — never copy licensing code into a plugin.

## Install

```bash
composer require wpistic/wordpress-sdk
```

## Integrate (plugin main file)

```php
use WPistic\Sdk\Licensing;

$seoistic_license = new Licensing( array(
    'product_slug'    => 'seoistic',
    'product_version' => SEOISTIC_VERSION,
    'plugin_file'     => __FILE__,
    // 'api_url'      => 'https://api.wpistic.com', // default
) );
$seoistic_license->boot();
```

`boot()` wires everything: the twice-daily validation cron, the secure update
client, the license settings screen (Settings → SEOistic License), and grace
period admin notices.

## Gate features with entitlements — never plan names

```php
if ( $seoistic_license->entitlements()->allows( 'seoistic.pro.enabled' ) ) {
    // premium behavior
}

$max_sites = $seoistic_license->entitlements()->limit( 'seoistic.sites.max' );
```

## What the SDK guarantees

- **Raw keys are never stored.** Activation exchanges the key for an
  activation token + a per-license verification key; only those persist.
- **Offline verification.** Every platform response is HMAC-signed; the SDK
  verifies signatures locally with the per-license key, so a tampered or
  spoofed response is never trusted.
- **Grace-period resilience.** If api.wpistic.com is unreachable, premium
  features stay active for the configured grace period (default 7 days) with
  an admin notice as it winds down. Expiry disables features — it never
  destroys data.
- **Secure updates.** Update metadata is license-gated; packages download
  through short-lived signed URLs and are checksum-verified (SHA-256) before
  WordPress installs them. Arbitrary package URLs are rejected.
- **WordPress-native security.** WordPress HTTP API with TLS verification,
  nonces on every admin action, sanitized input, escaped output, keys
  redacted from logs.

## Metered AI usage (optional)

```php
$seoistic_license->api()->post( '/api/v1/usage/events', array(
    'product'          => 'seoistic',
    'operation'        => 'ai_content_optimization',
    'units'            => 4,
    'idempotency_key'  => wp_generate_uuid4(),
    'activation_token' => $seoistic_license->activation_token(),
) );
```
