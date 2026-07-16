<?php
/**
 * Tests for WPistic\Core\REST\LicenseisticController.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\REST\LicenseisticController;
use WPistic\Core\Tests\Support\FakesRateLimitCache;
use WPistic\Core\Tests\Support\TestServices;
use WP_REST_Request;

final class LicenseisticControllerTest extends TestCase {

	use FakesRateLimitCache;

	private LicenseisticController $controller;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		Functions\when( 'apply_filters' )->returnArg( 2 );
		Functions\when( 'get_current_user_id' )->justReturn( 7 );
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		Functions\when( 'wp_http_validate_url' )->justReturn( false ); // No real domain given in most tests.
		Functions\when( 'untrailingslashit' )->alias( static fn( $u ) => rtrim( $u, '/' ) );

		$this->controller = new LicenseisticController( TestServices::container() );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_licenses_and_downloads_default_to_empty_when_licenseistic_is_absent(): void {
		$licenses  = $this->controller->licenses( new WP_REST_Request() );
		$downloads = $this->controller->downloads( new WP_REST_Request() );

		$this->assertSame( array(), $licenses->get_data()['licenses'] );
		$this->assertSame( array(), $downloads->get_data()['downloads'] );
	}

	public function test_activate_reports_unavailable_when_licenseistic_is_absent(): void {
		$store = array();
		$this->fake_cache( $store );

		$request = new WP_REST_Request();
		$request->set_param( 'license_key', 'ABC-123' );
		$request->set_param( 'domain', 'example.com' );

		$response = $this->controller->activate( $request );

		$this->assertFalse( $response->get_data()['success'] );
	}

	public function test_activate_is_rate_limited(): void {
		$store = array();
		$this->fake_cache( $store );

		$request = new WP_REST_Request();
		$request->set_param( 'license_key', 'ABC-123' );
		$request->set_param( 'domain', 'example.com' );

		for ( $i = 0; $i < 20; $i++ ) {
			$this->controller->activate( $request );
		}
		$response = $this->controller->activate( $request );

		$this->assertSame( 429, $response->get_status() );
	}

	public function test_validate_reports_unknown_status_when_licenseistic_is_absent(): void {
		$store = array();
		$this->fake_cache( $store );

		$request = new WP_REST_Request();
		$request->set_param( 'license_key', 'ABC-123' );

		$response = $this->controller->validate( $request );

		$this->assertFalse( $response->get_data()['valid'] );
		$this->assertSame( 'unknown', $response->get_data()['status'] );
	}

	/**
	 * args() normalizes the domain via Security::normalize_url() and falls
	 * back to the raw domain string when it isn't a valid absolute URL
	 * (e.g. a bare hostname like "example.com"). Neither shape should throw.
	 */
	public function test_deactivate_does_not_throw_for_a_bare_hostname_domain(): void {
		$request = new WP_REST_Request();
		$request->set_param( 'license_key', 'ABC-123' );
		$request->set_param( 'domain', 'example.com' );

		$response = $this->controller->deactivate( $request );

		$this->assertSame( 200, $response->get_status() );
		$this->assertFalse( $response->get_data()['success'] );
	}

	public function test_deactivate_does_not_throw_for_a_fully_qualified_url_domain(): void {
		Functions\when( 'wp_http_validate_url' )->justReturn( true );

		$request = new WP_REST_Request();
		$request->set_param( 'license_key', 'ABC-123' );
		$request->set_param( 'domain', 'https://example.com/' );

		$response = $this->controller->deactivate( $request );

		$this->assertSame( 200, $response->get_status() );
		$this->assertFalse( $response->get_data()['success'] );
	}
}
