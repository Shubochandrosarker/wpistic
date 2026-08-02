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

        // Compute signature
        $verify = $payload;
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
