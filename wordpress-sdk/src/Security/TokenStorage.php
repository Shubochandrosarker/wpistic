<?php

namespace Wpistic\Security;

/**
 * Encrypted token storage using WordPress salts.
 * All tokens are stored encrypted using AES-256-GCM.
 */
class TokenStorage {

    private static function getEncryptionKey(): string {
        return wp_salt('auth');
    }

    /**
     * Store a value encrypted in wp_options
     */
    public static function store(string $key, $value): void {
        $json = wp_json_encode($value);
        if ($json === false) {
            throw new \Exception("Failed to encode value for key: {$key}");
        }

        $iv = openssl_random_pseudo_bytes(12);
        $encrypted = openssl_encrypt(
            $json,
            'AES-256-GCM',
            self::getEncryptionKey(),
            0,
            $iv,
            $tag
        );

        if ($encrypted === false) {
            throw new \Exception("Failed to encrypt value for key: {$key}");
        }

        $stored = base64_encode($iv . $tag . $encrypted);
        update_option("wpistic_enc_{$key}", $stored);
    }

    /**
     * Retrieve and decrypt a value from wp_options
     */
    public static function retrieve(string $key): ?array {
        $raw = get_option("wpistic_enc_{$key}");
        if (!$raw) {
            return null;
        }

        $data = base64_decode($raw, true);
        if ($data === false) {
            return null;
        }

        $iv = substr($data, 0, 12);
        $tag = substr($data, 12, 16);
        $cipher = substr($data, 28);

        $decrypted = openssl_decrypt(
            $cipher,
            'AES-256-GCM',
            self::getEncryptionKey(),
            0,
            $iv,
            $tag
        );

        if ($decrypted === false) {
            return null;
        }

        $decoded = json_decode($decrypted, true);
        return is_array($decoded) ? $decoded : null;
    }

    /**
     * Delete an encrypted value
     */
    public static function delete(string $key): void {
        delete_option("wpistic_enc_{$key}");
    }
}
