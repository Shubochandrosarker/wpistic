<?php
/**
 * Security helpers: token hashing, key generation, sanitization.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Support;

defined( 'ABSPATH' ) || exit;

/**
 * Stateless security utilities used across the REST layer.
 */
class Security {

	/**
	 * Hash a secret (API key / site token) for at-rest storage.
	 *
	 * We never store raw secrets. A keyed SHA-256 (HMAC with the WP salt)
	 * gives constant-length, index-friendly, irreversible storage.
	 *
	 * @param string $secret Raw secret value.
	 */
	public static function hash_token( string $secret ): string {
		return hash_hmac( 'sha256', $secret, wp_salt( 'secure_auth' ) );
	}

	/**
	 * Constant-time comparison of a raw secret against a stored hash.
	 *
	 * @param string $secret Raw secret provided by the client.
	 * @param string $hash   Stored hash.
	 */
	public static function verify_token( string $secret, string $hash ): bool {
		return hash_equals( $hash, self::hash_token( $secret ) );
	}

	/**
	 * Generate a new API key.
	 *
	 * @return array{prefix:string,secret:string,plain:string} Prefix, raw secret, and display value.
	 */
	public static function generate_api_key(): array {
		$prefix = 'wpk_' . substr( bin2hex( random_bytes( 4 ) ), 0, 8 );
		$secret = bin2hex( random_bytes( 24 ) );
		return array(
			'prefix' => $prefix,
			'secret' => $secret,
			'plain'  => $prefix . '.' . $secret,
		);
	}

	/**
	 * Recursively sanitize an arbitrary request payload.
	 *
	 * @param mixed $value Raw value.
	 * @return mixed Sanitized value.
	 */
	public static function sanitize_deep( $value ) {
		if ( is_array( $value ) ) {
			return array_map( array( self::class, 'sanitize_deep' ), $value );
		}
		if ( is_string( $value ) ) {
			return sanitize_text_field( $value );
		}
		return $value;
	}

	/**
	 * Validate and normalize a site URL.
	 *
	 * @param string $url Raw URL.
	 * @return string|null Normalized URL or null when invalid.
	 */
	public static function normalize_url( string $url ): ?string {
		$url = esc_url_raw( trim( $url ) );
		if ( '' === $url || ! wp_http_validate_url( $url ) ) {
			return null;
		}
		return untrailingslashit( $url );
	}
}
