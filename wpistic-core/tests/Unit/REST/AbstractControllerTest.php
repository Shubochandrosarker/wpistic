<?php
/**
 * Tests for WPistic\Core\REST\AbstractController.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\Support\ServiceContainer;
use WPistic\Core\Tests\Unit\REST\Fixtures\TestableController;
use WP_Error;
use WP_REST_Request;

final class AbstractControllerTest extends TestCase {

	private TestableController $controller;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		Functions\when( '__' )->returnArg( 1 );
		$this->controller = new TestableController( new ServiceContainer() );
	}

	protected function tearDown(): void {
		unset( $_COOKIE[ LOGGED_IN_COOKIE ], $_SERVER['REMOTE_ADDR'] );
		Monkey\tearDown();
		parent::tearDown();
	}

	// ── require_dashboard_access ────────────────────────────────

	public function test_require_dashboard_access_rejects_logged_out_users(): void {
		Functions\when( 'is_user_logged_in' )->justReturn( false );

		$result = $this->controller->require_dashboard_access( new WP_REST_Request() );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_unauthorized', $result->get_error_code() );
		$this->assertSame( 401, $result->get_error_data()['status'] );
	}

	public function test_require_dashboard_access_rejects_users_without_the_capability(): void {
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'current_user_can' )->justReturn( false );

		$result = $this->controller->require_dashboard_access( new WP_REST_Request() );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_forbidden', $result->get_error_code() );
		$this->assertSame( 403, $result->get_error_data()['status'] );
	}

	public function test_require_dashboard_access_passes_for_an_authorized_token_request(): void {
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'current_user_can' )->justReturn( true );

		// No LOGGED_IN_COOKIE set => token-auth path, verify_nonce short-circuits true.
		$result = $this->controller->require_dashboard_access( new WP_REST_Request() );

		$this->assertTrue( $result );
	}

	public function test_require_dashboard_access_rejects_a_cookie_authenticated_request_with_a_bad_nonce(): void {
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'current_user_can' )->justReturn( true );
		Functions\when( 'wp_verify_nonce' )->justReturn( false );

		$_COOKIE[ LOGGED_IN_COOKIE ] = 'some-cookie-value';

		$request = new WP_REST_Request();
		$request->set_header( 'X-WP-Nonce', 'bad-nonce' );

		$result = $this->controller->require_dashboard_access( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_bad_nonce', $result->get_error_code() );
		$this->assertSame( 403, $result->get_error_data()['status'] );
	}

	// ── verify_nonce ─────────────────────────────────────────────

	public function test_verify_nonce_passes_with_a_valid_nonce(): void {
		Functions\when( 'wp_verify_nonce' )->justReturn( true );

		$request = new WP_REST_Request();
		$request->set_header( 'X-WP-Nonce', 'good-nonce' );

		$this->assertTrue( $this->controller->verify_nonce_public( $request ) );
	}

	public function test_verify_nonce_allows_token_authenticated_requests_without_a_cookie(): void {
		$request = new WP_REST_Request(); // no X-WP-Nonce header, no cookie.

		$this->assertTrue( $this->controller->verify_nonce_public( $request ) );
	}

	public function test_verify_nonce_rejects_a_cookie_authenticated_request_with_a_missing_nonce(): void {
		$_COOKIE[ LOGGED_IN_COOKIE ] = 'some-cookie-value';

		$request = new WP_REST_Request(); // no X-WP-Nonce header at all.

		$result = $this->controller->verify_nonce_public( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_bad_nonce', $result->get_error_code() );
	}

	public function test_verify_nonce_rejects_a_cookie_authenticated_request_with_an_invalid_nonce(): void {
		Functions\when( 'wp_verify_nonce' )->justReturn( false );

		$_COOKIE[ LOGGED_IN_COOKIE ] = 'some-cookie-value';

		$request = new WP_REST_Request();
		$request->set_header( 'X-WP-Nonce', 'stale-nonce' );

		$result = $this->controller->verify_nonce_public( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 403, $result->get_error_data()['status'] );
	}

	// ── require_capability ───────────────────────────────────────

	public function test_require_capability_returns_the_dashboard_access_error_first(): void {
		Functions\when( 'is_user_logged_in' )->justReturn( false );

		$callback = $this->controller->require_capability_public( 'wpistic_manage_billing' );
		$result   = $callback( new WP_REST_Request() );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_unauthorized', $result->get_error_code() );
	}

	public function test_require_capability_rejects_a_user_missing_the_specific_capability(): void {
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'current_user_can' )->alias(
			static fn( $cap ) => 'wpistic_access_dashboard' === $cap
		);

		$callback = $this->controller->require_capability_public( 'wpistic_manage_billing' );
		$result   = $callback( new WP_REST_Request() );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_forbidden', $result->get_error_code() );
	}

	public function test_require_capability_passes_when_both_checks_succeed(): void {
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'current_user_can' )->justReturn( true );

		$callback = $this->controller->require_capability_public( 'wpistic_manage_billing' );
		$result   = $callback( new WP_REST_Request() );

		$this->assertTrue( $result );
	}

	// ── rate_limit ────────────────────────────────────────────────

	public function test_rate_limit_allows_requests_within_budget_for_a_logged_in_user(): void {
		$store = array();
		$this->fake_cache( $store );
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$this->assertTrue( $this->controller->rate_limit_public( 'login', 2, 60 ) );
	}

	public function test_rate_limit_blocks_once_the_budget_is_exhausted(): void {
		$store = array();
		$this->fake_cache( $store );
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$this->controller->rate_limit_public( 'login', 1, 60 );
		$result = $this->controller->rate_limit_public( 'login', 1, 60 );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_rate_limited', $result->get_error_code() );
		$this->assertSame( 429, $result->get_error_data()['status'] );
	}

	public function test_rate_limit_keys_anonymous_callers_by_ip_not_user_id(): void {
		$store = array();
		$this->fake_cache( $store );
		Functions\when( 'is_user_logged_in' )->justReturn( false );
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'wp_unslash' )->returnArg( 1 );

		$_SERVER['REMOTE_ADDR'] = '198.51.100.9';

		$this->controller->rate_limit_public( 'login', 1, 60 );
		$result = $this->controller->rate_limit_public( 'login', 1, 60 );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_rate_limited', $result->get_error_code() );
	}

	/**
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
