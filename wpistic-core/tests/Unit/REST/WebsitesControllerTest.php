<?php
/**
 * Tests for WPistic\Core\REST\WebsitesController.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\REST\WebsitesController;
use WPistic\Core\Services\WorkspaceService;
use WPistic\Core\Tests\Support\FakeWpdb;
use WPistic\Core\Tests\Support\FakesRateLimitCache;
use WPistic\Core\Tests\Support\TestServices;
use WP_Error;
use WP_REST_Request;

final class WebsitesControllerTest extends TestCase {

	use FakesRateLimitCache;

	private $container;

	private WebsitesController $controller;

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
		Functions\when( 'get_current_user_id' )->justReturn( 7 );
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		Functions\when( 'wp_http_validate_url' )->justReturn( true );
		Functions\when( 'untrailingslashit' )->alias( static fn( $u ) => rtrim( $u, '/' ) );
		Functions\when( 'wp_parse_url' )->alias( static fn( $u, $c ) => parse_url( $u, $c ) );
		Functions\when( 'is_user_logged_in' )->justReturn( true );

		$this->container  = TestServices::container();
		$this->controller = new WebsitesController( $this->container );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function withWorkspace(): array {
		return $this->container->get( WorkspaceService::class )->create( 7, 'Acme Inc' );
	}

	public function test_index_propagates_the_no_workspace_error(): void {
		$result = $this->controller->index( new WP_REST_Request() );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_no_workspace', $result->get_error_code() );
	}

	public function test_index_lists_the_workspaces_websites(): void {
		$this->withWorkspace();

		$response = $this->controller->index( new WP_REST_Request() );

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( array(), $response->get_data()['websites'] );
	}

	public function test_connect_rejects_an_invalid_url(): void {
		$this->withWorkspace();
		Functions\when( 'wp_http_validate_url' )->justReturn( false );
		$store = array();
		$this->fake_cache( $store );

		$request = new WP_REST_Request();
		$request->set_param( 'url', 'not-a-url' );
		$request->set_param( 'name', '' );

		$result = $this->controller->connect( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_invalid_url', $result->get_error_code() );
	}

	public function test_connect_succeeds_and_logs_activity(): void {
		$workspace = $this->withWorkspace();
		$store     = array();
		$this->fake_cache( $store );

		$request = new WP_REST_Request();
		$request->set_param( 'url', 'https://a.example.com' );
		$request->set_param( 'name', 'A Site' );

		$response = $this->controller->connect( $request );

		$this->assertSame( 201, $response->get_status() );
		$this->assertSame( 'A Site', $response->get_data()['website']['name'] );

		$log = array_values( $this->container->get( \WPistic\Core\Services\ActivityService::class )->recent( $workspace['id'] ) );
		$this->assertCount( 1, $log );
		$this->assertSame( 'website_connected', $log[0]['event_type'] );
	}

	public function test_connect_is_rate_limited(): void {
		$this->withWorkspace();
		$store = array();
		$this->fake_cache( $store );

		$request = new WP_REST_Request();
		$request->set_param( 'url', 'https://a.example.com' );

		for ( $i = 0; $i < 10; $i++ ) {
			$this->controller->connect( $request );
		}
		$result = $this->controller->connect( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_rate_limited', $result->get_error_code() );
	}

	public function test_disconnect_removes_a_website_owned_by_the_workspace(): void {
		$this->withWorkspace();
		$store = array();
		$this->fake_cache( $store );

		$connect_request = new WP_REST_Request();
		$connect_request->set_param( 'url', 'https://a.example.com' );
		$connected = $this->controller->connect( $connect_request );

		$delete_request = new WP_REST_Request();
		$delete_request->set_param( 'id', $connected->get_data()['website']['id'] );

		$response = $this->controller->disconnect( $delete_request );

		$this->assertSame( 200, $response->get_status() );
		$this->assertTrue( $response->get_data()['deleted'] );
	}

	public function test_disconnect_returns_not_found_for_a_missing_website(): void {
		$this->withWorkspace();

		$request = new WP_REST_Request();
		$request->set_param( 'id', 999 );

		$result = $this->controller->disconnect( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_not_found', $result->get_error_code() );
	}
}
