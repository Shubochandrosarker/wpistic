<?php
/**
 * Tests for WPistic\Core\REST\DashboardController (exercises DashboardService
 * end-to-end, since it has no dedicated test file of its own).
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\REST\DashboardController;
use WPistic\Core\Services\WorkspaceService;
use WPistic\Core\Services\WebsiteService;
use WPistic\Core\Services\ActivityService;
use WPistic\Core\Tests\Support\FakeWpdb;
use WPistic\Core\Tests\Support\TestServices;
use WP_REST_Request;

final class DashboardControllerTest extends TestCase {

	private $container;

	private DashboardController $controller;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		global $wpdb;
		$wpdb = new FakeWpdb();

		$counter = 0;
		Functions\when( 'current_time' )->alias(
			static function () use ( &$counter ) {
				++$counter;
				return sprintf( '2026-01-01 00:00:%02d', $counter );
			}
		);
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'sanitize_key' )->alias( static fn( $v ) => strtolower( (string) $v ) );
		Functions\when( 'sanitize_title' )->alias( static fn( $v ) => strtolower( (string) $v ) );
		Functions\when( 'wp_json_encode' )->alias( static fn( $v ) => json_encode( $v ) );
		Functions\when( 'do_action' )->justReturn( null );
		Functions\when( 'apply_filters' )->returnArg( 2 );
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		Functions\when( 'wp_http_validate_url' )->justReturn( true );
		Functions\when( 'untrailingslashit' )->alias( static fn( $u ) => rtrim( $u, '/' ) );
		Functions\when( 'wp_parse_url' )->alias( static fn( $u, $c ) => parse_url( $u, $c ) );
		Functions\when( 'get_current_user_id' )->justReturn( 7 );
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );

		$this->container  = TestServices::container();
		$this->controller = new DashboardController( $this->container );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_reports_empty_when_the_user_has_no_workspace(): void {
		$response = $this->controller->get_overview( new WP_REST_Request() );

		$this->assertSame( 200, $response->get_status() );
		$this->assertTrue( $response->get_data()['empty'] );
		$this->assertNull( $response->get_data()['workspace'] );
	}

	public function test_aggregates_workspace_websites_and_activity(): void {
		$workspace = $this->container->get( WorkspaceService::class )->create( 7, 'Acme Inc' );
		$this->container->get( WebsiteService::class )->connect( $workspace['id'], 'https://a.example.com' );
		$this->container->get( ActivityService::class )->record( $workspace['id'], 'website_connected' );

		$response = $this->controller->get_overview( new WP_REST_Request() );
		$data     = $response->get_data();

		$this->assertFalse( $data['empty'] );
		$this->assertSame( 'Acme Inc', $data['workspace']['name'] );
		$this->assertCount( 1, $data['websites'] );
		$this->assertSame( 1, $data['stats']['websites'] );
		$this->assertCount( 1, $data['activity'] );
		$this->assertArrayHasKey( 'memberistic', $data['modules'] );
	}

	public function test_licenses_stats_default_to_zero_when_licenseistic_is_not_active(): void {
		$this->container->get( WorkspaceService::class )->create( 7, 'Acme Inc' );

		$response = $this->controller->get_overview( new WP_REST_Request() );
		$data     = $response->get_data();

		$this->assertSame( 0, $data['stats']['licenses'] );
		$this->assertSame( 0, $data['stats']['licenses_attn'] );
	}
}
