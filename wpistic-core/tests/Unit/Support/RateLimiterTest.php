<?php
/**
 * Tests for WPistic\Core\Support\RateLimiter.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\Support;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\Support\RateLimiter;

final class RateLimiterTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * Wire wp_cache_get/set/incr to a plain in-memory array so the real
	 * check-then-increment logic in RateLimiter::check() runs against
	 * something that actually remembers state between calls, the same way
	 * the real object cache would.
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

	public function test_allows_requests_within_the_limit(): void {
		$store = array();
		$this->fake_cache( $store );

		$this->assertTrue( RateLimiter::check( 'login', '1.2.3.4', 3, 60 ) );
		$this->assertTrue( RateLimiter::check( 'login', '1.2.3.4', 3, 60 ) );
		$this->assertTrue( RateLimiter::check( 'login', '1.2.3.4', 3, 60 ) );
	}

	public function test_blocks_once_the_limit_is_reached(): void {
		$store = array();
		$this->fake_cache( $store );

		RateLimiter::check( 'login', '1.2.3.4', 2, 60 );
		RateLimiter::check( 'login', '1.2.3.4', 2, 60 );

		$this->assertFalse( RateLimiter::check( 'login', '1.2.3.4', 2, 60 ) );
	}

	public function test_a_zero_limit_blocks_the_very_first_request(): void {
		$store = array();
		$this->fake_cache( $store );

		$this->assertFalse( RateLimiter::check( 'login', '1.2.3.4', 0, 60 ) );
	}

	public function test_different_keys_are_tracked_independently(): void {
		$store = array();
		$this->fake_cache( $store );

		RateLimiter::check( 'login', '1.2.3.4', 1, 60 );

		$this->assertTrue( RateLimiter::check( 'login', '5.6.7.8', 1, 60 ) );
	}

	public function test_different_buckets_for_the_same_key_are_tracked_independently(): void {
		$store = array();
		$this->fake_cache( $store );

		RateLimiter::check( 'login', '1.2.3.4', 1, 60 );

		$this->assertTrue( RateLimiter::check( 'activate', '1.2.3.4', 1, 60 ) );
	}

	public function test_client_ip_returns_a_valid_remote_addr(): void {
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'wp_unslash' )->returnArg( 1 );

		$_SERVER['REMOTE_ADDR'] = '203.0.113.5';

		try {
			$this->assertSame( '203.0.113.5', RateLimiter::client_ip() );
		} finally {
			unset( $_SERVER['REMOTE_ADDR'] );
		}
	}

	/**
	 * Documents a known sharp edge: when REMOTE_ADDR is absent, every such
	 * caller collapses onto the same "0.0.0.0" rate-limit bucket key.
	 */
	public function test_client_ip_falls_back_to_zero_address_when_remote_addr_is_missing(): void {
		unset( $_SERVER['REMOTE_ADDR'] );

		$this->assertSame( '0.0.0.0', RateLimiter::client_ip() );
	}

	public function test_client_ip_falls_back_to_zero_address_when_remote_addr_is_malformed(): void {
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'wp_unslash' )->returnArg( 1 );

		$_SERVER['REMOTE_ADDR'] = 'not-an-ip';

		try {
			$this->assertSame( '0.0.0.0', RateLimiter::client_ip() );
		} finally {
			unset( $_SERVER['REMOTE_ADDR'] );
		}
	}
}
