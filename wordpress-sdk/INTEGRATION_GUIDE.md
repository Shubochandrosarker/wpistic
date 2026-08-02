# WPistic WordPress SDK Integration Guide

This guide explains how to integrate the WPistic licensing system into your WordPress plugin.

## Installation

Add to your plugin's `composer.json`:

```json
{
  "require": {
    "wpistic/wordpress-sdk": "^1.0"
  }
}
```

Then run:
```bash
composer install --no-dev
```

## Quick Start

In your main plugin file:

```php
<?php
// my-plugin/my-plugin.php

use WPistic\Sdk\Licensing;

// Initialize licensing
$licensing = new Licensing([
    'product_slug'    => 'my-plugin',
    'product_version' => '1.0.0',
    'plugin_file'     => __FILE__,
    // 'api_url'      => 'https://api.wpistic.com', // optional, default shown
]);

// Wire up cron + admin UI + updater
$licensing->boot();
```

That's it! Your plugin now has:
- License activation form
- Automatic daily re-validation
- Secure update checking
- Entitlement-based feature gating
- 7-day offline grace period

## Entitlement Gating

Check if user can access a feature:

```php
// Get the licensing instance (save it as a plugin global or use hooks)
$licensing = WPistic\Sdk\Licensing::instance();

// Check boolean entitlement
if ( $licensing->entitlements()->allows( 'my-plugin.pro.enabled' ) ) {
    // Show pro features
}

// Get numeric limit
$max_sites = $licensing->entitlements()->getMax( 'my-plugin.sites.max' );
$current_sites = count_user_sites_in_use();

if ( $current_sites >= $max_sites ) {
    // Show "upgrade" message
}

// Check if pro plan (convenience method)
if ( $licensing->entitlements()->isPro() ) {
    // Premium plugin behavior
}
```

## Admin Settings Page

The SDK automatically adds a WPistic settings page under Settings → WPistic.

Display the settings page link:

```php
add_action( 'admin_menu', function() {
    add_submenu_page(
        'options-general.php',
        'License',
        'License',
        'manage_options',
        'wpistic_license',
        [ \WPistic\Sdk\Admin::class, 'renderPage' ]
    );
} );
```

## Hooks & Filters

### Actions

```php
// Fired after successful activation
do_action( 'wpistic_license_activated', $activation_token, $license_status );

// Fired after deactivation
do_action( 'wpistic_license_deactivated' );

// Fired during scheduled validation (even if API down)
do_action( 'wpistic_license_validated', $is_valid, $response );

// Fired when grace period started
do_action( 'wpistic_grace_period_started', $ends_at );

// Fired when grace period ended (features degrade)
do_action( 'wpistic_grace_period_ended' );
```

Example:

```php
add_action( 'wpistic_license_activated', function( $token, $status ) {
    wp_remote_post( 'https://your-analytics.com/track', [
        'body' => json_encode( [
            'event'  => 'license_activated',
            'status' => $status,
        ] ),
    ] );
} );
```

### Filters

```php
// Customize the license key input placeholder
apply_filters( 'wpistic_license_key_placeholder', 'Enter your license key...' );

// Customize the settings page title
apply_filters( 'wpistic_settings_page_title', 'My Plugin License' );

// Add custom fields to the settings page
apply_filters( 'wpistic_settings_extra_fields', [] );
```

## Activation & Deactivation

### Programmatic Activation

```php
$licensing = new Licensing( [...] );

$result = $licensing->activate( 'my-plugin_abc123def456...' );

if ( is_wp_error( $result ) ) {
    echo 'Activation failed: ' . $result->get_error_message();
} else {
    echo 'License activated!';
}
```

### Deactivation

```php
$result = $licensing->deactivate();

if ( is_wp_error( $result ) ) {
    // Handle error (e.g., network failure)
    // License remains active locally via grace period
} else {
    // License deactivated successfully
}
```

### Checking Activation Status

```php
$state = $licensing->state();

if ( empty( $state['activation_token'] ) ) {
    // Not activated
    echo 'License not activated. Enter your key in settings.';
} elseif ( $state['status'] === 'grace_period' ) {
    // API down but still active
    printf(
        'API temporarily unreachable. Features active until %s.',
        wp_date( 'M j, Y', strtotime( $state['grace_period_ends_at'] ) )
    );
} elseif ( $state['status'] === 'active' ) {
    // Fully active
    echo 'License active.';
} else {
    // Expired, revoked, etc.
    echo 'License invalid: ' . $state['status'];
}
```

## Feature Gates

Example: Show pro-only admin notice:

```php
add_action( 'admin_notices', function() {
    $licensing = new Licensing( [...] );
    
    if ( ! $licensing->entitlements()->allows( 'my-plugin.pro.enabled' ) ) {
        ?>
        <div class="notice notice-info">
            <p>
                Upgrade to <strong>Pro</strong> to unlock advanced features.
                <a href="https://www.my-plugin.com/upgrade">Upgrade now</a>
            </p>
        </div>
        <?php
    }
} );
```

Example: Disable feature if limit exceeded:

```php
// In your shortcode handler
add_shortcode( 'my-feature', function() {
    $licensing = new Licensing( [...] );
    $limit = $licensing->entitlements()->getMax( 'my-plugin.instances.max' );
    
    if ( count_active_instances() >= $limit ) {
        return '<div class="error">Feature limit reached. Upgrade your plan.</div>';
    }
    
    // Render the feature
} );
```

## Update Checking

The SDK automatically hooks into WordPress's update system. When a user checks for updates:

1. Plugin calls `/api/v1/products/{slug}/updates?version=X&license_token=Y`
2. API returns new version + secure download URL
3. Plugin downloads and verifies SHA-256 checksum
4. User can install via standard WordPress update UI

No additional code needed! Update checking is automatic.

### Custom Update Channel

Users can opt into beta updates via the settings page:

```php
// Get current update channel (stable|beta)
$channel = $licensing->updateChannel();

// Subscribe to beta updates
apply_filters( 'wpistic_update_channel', $channel ); // returns 'beta' if user subscribed
```

## Offline Resilience (Grace Period)

If the WPistic API is unreachable:

1. **Days 1-7**: Plugin serves cached validation response. Premium features active. Admin notice shown.
2. **Day 8+**: Cache expires. Premium features disabled. Admin notice: "Please update your license."

This ensures customers can keep working even if the platform is down.

### Disable Grace Period (Optional)

To disable grace period (strict mode):

```php
$licensing = new Licensing( [
    'product_slug'    => 'my-plugin',
    'product_version' => '1.0.0',
    'plugin_file'     => __FILE__,
    'grace_period_days' => 0, // Disable grace period
] );
```

## Security Considerations

### 1. Never Log Raw Keys
```php
// ❌ BAD
error_log( 'License key: ' . $raw_key );

// ✅ GOOD
error_log( 'License key: ' . substr( $raw_key, 0, 10 ) . '***' );
```

### 2. Sanitize & Escape User Input
```php
// ❌ BAD
$key = $_POST['license_key'];

// ✅ GOOD
$key = sanitize_text_field( $_POST['license_key'] );
```

### 3. Use Nonces for Admin Forms
```php
// In your form
wp_nonce_field( 'wpistic_activate', 'wpistic_nonce' );

// In your handler
if ( ! isset( $_POST['wpistic_nonce'] ) || ! wp_verify_nonce( $_POST['wpistic_nonce'], 'wpistic_activate' ) ) {
    die( 'Nonce verification failed' );
}
```

### 4. Encrypt Sensitive Stored Data
The SDK automatically encrypts activation tokens using `wp_salt( 'auth' )`. Don't decrypt or expose tokens.

## Troubleshooting

### License Won't Activate

**Problem**: "License key not recognized" or 404 error

**Solutions**:
1. Verify key format: `productname_` prefix + 32-char hex
2. Check organization billing status (must be active)
3. Verify license hasn't been revoked/transferred
4. Check network connectivity (test with curl)

### Plugin Can't Reach API

**Problem**: "Could not reach the WPistic licensing service"

**Solutions**:
1. Check your server can make outbound HTTPS requests
2. Verify firewall/WAF doesn't block api.wpistic.com
3. Check if system SSL certificate is outdated: `php -r 'echo openssl_version();'`
4. Grace period should keep features active for 7 days

### Entitlements Not Updating

**Problem**: Plan upgraded but features still locked

**Solutions**:
1. Entitlements cached for 12 hours — check back later
2. Force refresh: Delete `wp_options` row starting with `wpistic_*_entitlements`
3. Manually trigger re-validation: Settings → WPistic → "Re-validate Now" button
4. Check license status shows correct plan in WPistic dashboard

### Updates Not Showing

**Problem**: WordPress doesn't show new plugin version

**Solutions**:
1. Verify license is active (see above)
2. Check version in your plugin header matches WPistic release version
3. WordPress caches update metadata — wait 12 hours or manually invalidate:
   ```php
   delete_site_transient( 'update_plugins' );
   ```
4. Check `/wp-admin/update-core.php` if update appears there

## Advanced: Custom Onboarding Flow

If you want a custom license activation UI instead of the default form:

```php
// Create custom activation page
add_action( 'wp_ajax_my_plugin_activate', function() {
    check_ajax_referer( 'my-plugin-activate' );

    $licensing = new Licensing( [...] );
    $result = $licensing->activate( sanitize_text_field( $_POST['key'] ) );

    if ( is_wp_error( $result ) ) {
        wp_send_json_error( [ 'message' => $result->get_error_message() ] );
    }

    wp_send_json_success( [ 'message' => 'License activated!' ] );
} );
```

## Examples

### Complete Plugin Setup

```php
<?php
/**
 * My Amazing Plugin
 * Plugin URI: https://my-plugin.com
 * Version: 1.0.0
 */

use WPistic\Sdk\Licensing;

// Initialize licensing
global $my_plugin_licensing;
$my_plugin_licensing = new Licensing( [
    'product_slug'    => 'my-amazing-plugin',
    'product_version' => '1.0.0',
    'plugin_file'     => __FILE__,
] );

// Boot licensing system
$my_plugin_licensing->boot();

// Use in your features
add_action( 'wp_loaded', function() {
    global $my_plugin_licensing;
    
    if ( ! $my_plugin_licensing->entitlements()->allows( 'my-amazing-plugin.pro.enabled' ) ) {
        // Disable pro features
        return;
    }
    
    // Load pro features
    require_once __DIR__ . '/pro-features.php';
} );
```

---

## Support

For issues or questions:
1. Check [API Specification](../docs/API_SPECIFICATION.md)
2. Review [PHP SDK Source](./src/)
3. Visit [WPistic Support](https://app.wpistic.com/support)
