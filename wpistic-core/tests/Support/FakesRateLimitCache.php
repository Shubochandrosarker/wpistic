<?php
/**
 * Shared wp_cache_* stub for tests that exercise RateLimiter-backed code
 * paths without a real object cache.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Support;

use Brain\Monkey\Functions;

trait FakesRateLimitCache {

	/**
	 * Wire wp_cache_get/set/incr to a plain in-memory array.
	 *
	 * @param array<string,array<string,int>> $store Backing store, passed by reference.
	 */
	private function fake_cache( array &$store ): void {
		Functions\when( 'wp_cache_get' )->alias(
			static function ( $key, $group ) use ( &$store ) {
				return $store[ $group ][ $key ] ?? false;
			}
		);
		Functions\when( 'wp_cache_set' )->alias(
			static function ( $key, $value, $group, $ttl = 0 ) use ( &$store ) {
				$store[ $group ][ $key ] = $value;
				return true;
			}
		);
		Functions\when( 'wp_cache_incr' )->alias(
			static function ( $key, $offset = 1, $group = '' ) use ( &$store ) {
				$store[ $group ][ $key ] = ( $store[ $group ][ $key ] ?? 0 ) + $offset;
				return $store[ $group ][ $key ];
			}
		);
	}
}
