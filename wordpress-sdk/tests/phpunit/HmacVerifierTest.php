<?php

namespace Wpistic\Tests;

use PHPUnit\Framework\TestCase;
use Wpistic\Security\HmacVerifier;

class HmacVerifierTest extends TestCase {

    public function testVerifyValidSignature() {
        // Create a test payload
        $payload = [
            'valid' => true,
            'status' => 'active',
            'plan' => 'professional',
            'expires_at' => '2026-12-31T23:59:59Z',
        ];

        // Create a derived key (hex string)
        $masterSecret = 'test-master-secret';
        $licenseId = 'lic_123';
        $key = hash_hmac('sha256', "license-verification:{$licenseId}", $masterSecret);

        // Compute signature over the canonical form (sorted keys, no whitespace)
        $verify = $payload;
        ksort($verify, SORT_STRING);
        $canonical = json_encode($verify, JSON_UNESCAPED_SLASHES);
        $signature = hash_hmac('sha256', $canonical, hex2bin($key));

        // Add signature to payload
        $payload['signature'] = $signature;

        // Verify should pass
        $this->assertTrue(HmacVerifier::verify($key, $payload, $signature));
    }

    public function testVerifyInvalidSignature() {
        $payload = [
            'valid' => true,
            'status' => 'active',
            'signature' => 'invalid_signature',
        ];

        $key = hash('sha256', 'test-key');
        $this->assertFalse(HmacVerifier::verify($key, $payload, 'invalid_signature'));
    }

    /**
     * Golden vector shared verbatim with the platform API
     * (wpistic-platform/apps/api/src/utils/crypto.test.ts, "matches the
     * cross-language golden vector"). The signature below was produced by
     * the TypeScript signLicenseResponse implementation — verifying it here
     * proves both sides implement the same contract: hex encoding, null
     * values kept in canonical JSON, slashes and unicode unescaped.
     */
    public function testGoldenVectorMatchesPlatformApi() {
        $derivedKey = '2af17247559acf975100e3e5ea4fbbd5e6a8336bd80ef3e4c7bee351ffa12adb';
        $payload = [
            'valid' => true,
            'status' => 'active',
            'plan' => 'professional',
            'product' => 'insightistic',
            'expires_at' => '2027-01-01T00:00:00Z',
            'grace_period_ends_at' => null,
            'check_again_after' => 43200,
            'portal_url' => 'https://app.wpistic.com/licenses',
            'signature' => 'a7e17a8766ed9ad2fcef29d183379ed11e393a224421d3470599383cc814b013',
        ];

        $this->assertTrue(HmacVerifier::verify($derivedKey, $payload, $payload['signature']));
    }

    public function testNullValuesAreKeptInCanonicalJson() {
        // The API includes null fields (e.g. grace_period_ends_at) on the
        // wire and signs them; dropping them here would break verification.
        $key = hash('sha256', 'test-key');

        $withNull = ['a' => 1, 'b' => null];
        $canonical = '{"a":1,"b":null}';
        $sig = hash_hmac('sha256', $canonical, hex2bin($key));

        $this->assertTrue(HmacVerifier::verify($key, $withNull, $sig));
    }

    public function testSlashesAreNotEscapedInCanonicalJson() {
        // JSON.stringify does not escape '/', so PHP must not either.
        $key = hash('sha256', 'test-key');

        $payload = ['url' => 'https://example.com/path'];
        $canonical = '{"url":"https://example.com/path"}';
        $sig = hash_hmac('sha256', $canonical, hex2bin($key));

        $this->assertTrue(HmacVerifier::verify($key, $payload, $sig));
    }

    public function testVerifyTampered() {
        $payload = [
            'valid' => true,
            'status' => 'active',
        ];

        $key = hash('sha256', 'test-key');

        // Compute original signature
        $canonical = json_encode($payload, JSON_UNESCAPED_SLASHES);
        $originalSig = hash_hmac('sha256', $canonical, hex2bin($key));

        // Tamper with payload
        $payload['valid'] = false;

        // Verification should fail
        $this->assertFalse(HmacVerifier::verify($key, $payload, $originalSig));
    }
}
