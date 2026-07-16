<?php
/**
 * Tests for WPistic\Core\REST\AuthController.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\REST\AuthController;
use WPistic\Core\Tests\Support\FakesRateLimitCache;
use WPistic\Core\Tests\Support\TestServices;
use WP_REST_Request;

final class AuthControllerTest extends TestCase {

	use FakesRateLimitCache;

	private AuthController $controller;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		Functions\when( 'apply_filters' )->returnArg( 2 );
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'wp_unslash' )->returnArg( 1 );

		$this->controller = new AuthController( TestServices::container() );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_status_reports_the_auth_plugin_as_unavailable_by_default(): void {
		$store = array();
		$this->fake_cache( $store );
		Functions\when( 'is_user_logged_in' )->justReturn( false );

		$response = $this->controller->status( new WP_REST_Request() );

		$this->assertSame( 200, $response->get_status() );
		$this->assertFalse( $response->get_data()['auth_plugin'] );
		$this->assertFalse( $response->get_data()['supports_jwt'] );
		$this->assertFalse( $response->get_data()['logged_in'] );
	}

	public function test_status_reflects_the_logged_in_state(): void {
		$store = array();
		$this->fake_cache( $store );
		Functions\when( 'is_user_logged_in' )->justReturn( true );

		$response = $this->controller->status( new WP_REST_Request() );

		$this->assertTrue( $response->get_data()['logged_in'] );
	}

	public function test_status_is_rate_limited(): void {
		$store = array();
		$this->fake_cache( $store );
		Functions\when( 'is_user_logged_in' )->justReturn( false );
		$_SERVER['REMOTE_ADDR'] = '203.0.113.5';

		for ( $i = 0; $i < 60; $i++ ) {
			$this->controller->status( new WP_REST_Request() );
		}
		$response = $this->controller->status( new WP_REST_Request() );

		$this->assertSame( 429, $response->get_status() );

		unset( $_SERVER['REMOTE_ADDR'] );
	}

	public function test_logout_rejects_a_cookie_authenticated_request_with_a_bad_nonce(): void {
		$_COOKIE[ LOGGED_IN_COOKIE ] = 'some-cookie-value';

		$response = $this->controller->logout( new WP_REST_Request() );

		$this->assertSame( 403, $response->get_status() );

		unset( $_COOKIE[ LOGGED_IN_COOKIE ] );
	}

	public function test_logout_succeeds_for_a_token_authenticated_request(): void {
		Functions\when( 'wp_logout' )->justReturn( null );

		// No LOGGED_IN_COOKIE set => token-auth path, verify_nonce short-circuits true.
		$response = $this->controller->logout( new WP_REST_Request() );

		$this->assertSame( 200, $response->get_status() );
		$this->assertTrue( $response->get_data()['logged_out'] );
	}
}
