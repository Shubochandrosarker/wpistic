<?php
/**
 * Lightweight fixed-window rate limiter backed by the object cache.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Support;

defined( 'ABSPATH' ) || exit;

/**
 * Rate limiting for sensitive REST endpoints (auth, activation, etc.).
 */
class RateLimiter {

	private const GROUP = 'wpistic_rl';

	/**
	 * Register a hit and report whether the caller is within budget.
	 *
	 * @param string $bucket  Logical bucket, e.g. "login".
	 * @param string $key     Caller key (IP, user id, token prefix).
	 * @param int    $limit   Maximum hits per window.
	 * @param int    $window  Window length in seconds.
	 * @return bool True when allowed, false when the limit is exceeded.
	 */
	public static function check( string $bucket, string $key, int $limit, int $window ): bool {
		$cache_key = $bucket . ':' . md5( $key );
		$current   = (int) wp_cache_get( $cache_key, self::GROUP );

		if ( $current >= $limit ) {
			return false;
		}

		if ( 0 === $current ) {
			wp_cache_set( $cache_key, 1, self::GROUP, $window );
		} else {
			wp_cache_incr( $cache_key, 1, self::GROUP );
		}

		return true;
	}

	/**
	 * Best-effort client IP for keying anonymous requests.
	 */
	public static function client_ip(): string {
		$ip = isset( $_SERVER['REMOTE_ADDR'] )
			? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) )
			: '0.0.0.0';
		return filter_var( $ip, FILTER_VALIDATE_IP ) ? $ip : '0.0.0.0';
	}
}
