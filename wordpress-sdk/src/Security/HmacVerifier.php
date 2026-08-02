<?php

namespace Wpistic\Security;

/**
 * Verifies HMAC-SHA256 signatures on license validation responses.
 */
class HmacVerifier {

    /**
     * Verify a hex-encoded HMAC signature
     */
    public static function verify(string $derivedKeyHex, array $payload, string $signature): bool {
        // Remove the signature field before verification
        $verify = $payload;
        unset($verify['signature']);

        // Create canonical JSON (sorted keys, no whitespace)
        $canonical = self::canonicalJson($verify);

        // Compute expected signature
        $expected = hash_hmac('sha256', $canonical, self::hexToBytes($derivedKeyHex));

        // Timing-safe comparison
        return hash_equals($expected, $signature);
    }

    /**
     * Canonical JSON: sorted keys, no whitespace
     */
    private static function canonicalJson($value): string {
        if ($value === null || !is_object($value) && !is_array($value)) {
            return json_encode($value);
        }

        if (is_object($value)) {
            $value = (array) $value;
        }

        if (is_array($value)) {
            // Check if it's a list or object
            $keys = array_keys($value);
            if ($keys === array_keys($keys)) {
                // It's a list
                $items = [];
                foreach ($value as $item) {
                    $items[] = self::canonicalJson($item);
                }
                return '[' . implode(',', $items) . ']';
            } else {
                // It's an object
                ksort($value);
                $items = [];
                foreach ($value as $k => $v) {
                    if ($v !== null) {
                        $items[] = json_encode($k) . ':' . self::canonicalJson($v);
                    }
                }
                return '{' . implode(',', $items) . '}';
            }
        }

        return json_encode($value);
    }

    /**
     * Convert hex string to bytes
     */
    private static function hexToBytes(string $hex): string {
        $bytes = '';
        for ($i = 0; $i < strlen($hex); $i += 2) {
            $bytes .= chr(hexdec(substr($hex, $i, 2)));
        }
        return $bytes;
    }
}
