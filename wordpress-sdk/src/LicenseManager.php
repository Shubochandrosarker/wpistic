<?php

namespace Wpistic;

use Wpistic\Security\TokenStorage;
use Wpistic\Security\HmacVerifier;

/**
 * Manages license activation, validation, and deactivation.
 */
class LicenseManager {

    private string $apiBaseUrl;
    private string $productSlug;

    public function __construct(string $apiBaseUrl, string $productSlug) {
        $this->apiBaseUrl = rtrim($apiBaseUrl, '/');
        $this->productSlug = $productSlug;
    }

    /**
     * Activate a license key
     */
    public function activate(string $licenseKey, array $siteInfo): array {
        $domain = DomainNormalizer::normalize(get_home_url());
        $installation_uuid = $this->getInstallationUuid();

        $response = wp_remote_post(
            "{$this->apiBaseUrl}/api/v1/licenses/activate",
            [
                'body' => wp_json_encode([
                    'key' => $licenseKey,
                    'domain' => $domain,
                    'environment' => $siteInfo['environment'] ?? 'production',
                    'installation_uuid' => $installation_uuid,
                    'site_url' => site_url(),
                    'home_url' => home_url(),
                    'product_version' => $siteInfo['product_version'] ?? null,
                    'wp_version' => get_bloginfo('version'),
                    'php_version' => phpversion(),
                ]),
                'headers' => ['Content-Type' => 'application/json'],
                'timeout' => 10,
            ]
        );

        if (is_wp_error($response)) {
            throw new \Exception("Activation request failed: " . $response->get_error_message());
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($body) || !($body['valid'] ?? false)) {
            throw new \Exception($body['error'] ?? 'Activation failed');
        }

        // Store encrypted token and derived key
        TokenStorage::store('activation_token', $body['activation_token']);
        TokenStorage::store('verification_key', $body['verification_key']);
        TokenStorage::store('last_validation', $body);

        return $body;
    }

    /**
     * Validate the current license
     */
    public function validate(): array {
        $token = TokenStorage::retrieve('activation_token');
        if (!$token || !is_string($token)) {
            throw new \Exception('No activation token found');
        }

        $domain = DomainNormalizer::normalize(get_home_url());
        $installation_uuid = $this->getInstallationUuid();

        $response = wp_remote_post(
            "{$this->apiBaseUrl}/api/v1/licenses/validate",
            [
                'body' => wp_json_encode([
                    'activation_token' => $token,
                    'domain' => $domain,
                    'environment' => wp_get_environment_type(),
                    'installation_uuid' => $installation_uuid,
                    'plugin_version' => wp_get_plugin_data(WP_PLUGIN_DIR . '/' . basename(dirname(__DIR__)), false, false)['Version'] ?? '1.0.0',
                ]),
                'headers' => ['Content-Type' => 'application/json'],
                'timeout' => 10,
            ]
        );

        if (is_wp_error($response)) {
            // Return cached response on network error
            return TokenStorage::retrieve('last_validation') ?? ['valid' => false];
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($body)) {
            return TokenStorage::retrieve('last_validation') ?? ['valid' => false];
        }

        // Verify signature
        $verificationKey = TokenStorage::retrieve('verification_key');
        if ($verificationKey && !HmacVerifier::verify($verificationKey, $body, $body['signature'] ?? '')) {
            throw new \Exception('Signature verification failed');
        }

        // Cache the response
        TokenStorage::store('last_validation', $body);

        return $body;
    }

    /**
     * Deactivate the license
     */
    public function deactivate(): bool {
        $token = TokenStorage::retrieve('activation_token');
        if (!$token) {
            return false;
        }

        $installation_uuid = $this->getInstallationUuid();

        wp_remote_post(
            "{$this->apiBaseUrl}/api/v1/licenses/deactivate",
            [
                'body' => wp_json_encode([
                    'activation_token' => $token,
                    'installation_uuid' => $installation_uuid,
                ]),
                'headers' => ['Content-Type' => 'application/json'],
                'timeout' => 10,
            ]
        );

        // Clear all stored tokens
        TokenStorage::delete('activation_token');
        TokenStorage::delete('verification_key');
        TokenStorage::delete('last_validation');

        return true;
    }

    /**
     * Check if license is currently valid
     */
    public function isValid(): bool {
        $cached = TokenStorage::retrieve('last_validation');
        if (!$cached) {
            return false;
        }

        // Check if valid
        if (!($cached['valid'] ?? false)) {
            return false;
        }

        // Check if in grace period
        if (($cached['status'] ?? null) === 'grace_period') {
            $graceEnd = $cached['grace_period_ends_at'] ?? null;
            return $graceEnd && strtotime($graceEnd) > time();
        }

        // Check expiration
        $expiresAt = $cached['expires_at'] ?? null;
        if ($expiresAt && strtotime($expiresAt) < time()) {
            return false;
        }

        return true;
    }

    /**
     * Get or create installation UUID
     */
    private function getInstallationUuid(): string {
        $uuid = get_option('wpistic_installation_uuid');
        if (!$uuid) {
            $uuid = wp_generate_uuid4();
            update_option('wpistic_installation_uuid', $uuid);
        }
        return $uuid;
    }
}
