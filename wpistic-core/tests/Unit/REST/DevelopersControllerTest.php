<?php
/**
 * Tests for WPistic\Core\REST\DevelopersController.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\REST\DevelopersController;
use WPistic\Core\Services\ActivityService;
use WPistic\Core\Services\WorkspaceService;
use WPistic\Core\Tests\Support\FakeWpdb;
use WPistic\Core\Tests\Support\FakesRateLimitCache;
use WPistic\Core\Tests\Support\TestServices;
use WP_Error;
use WP_REST_Request;

final class DevelopersControllerTest extends TestCase {

	use FakesRateLimitCache;

	private $container;

	private DevelopersController $controller;

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
		Functions\when( 'is_user_logged_in' )->justReturn( true );

		$this->container  = TestServices::container();
		$this->controller = new DevelopersController( $this->container );
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

	public function test_index_lists_the_workspaces_keys(): void {
		$this->withWorkspace();

		$response = $this->controller->index( new WP_REST_Request() );

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( array(), $response->get_data()['keys'] );
	}

	public function test_create_returns_the_key_once_and_logs_activity(): void {
		$workspace = $this->withWorkspace();
		$store     = array();
		$this->fake_cache( $store );

		$request = new WP_REST_Request();
		$request->set_param( 'label', 'CI key' );

		$response = $this->controller->create( $request );

		$this->assertSame( 201, $response->get_status() );
		$this->assertMatchesRegularExpression( '/^wpk_/', $response->get_data()['key']['plain'] );

		$log = $this->container->get( ActivityService::class )->recent( $workspace['id'] );
		$this->assertSame( 'api_key_created', $log[0]['event_type'] );
	}

	public function test_create_is_rate_limited(): void {
		$this->withWorkspace();
		$store = array();
		$this->fake_cache( $store );

		$request = new WP_REST_Request();
		$request->set_param( 'label', 'CI key' );

		for ( $i = 0; $i < 10; $i++ ) {
			$this->controller->create( $request );
		}
		$result = $this->controller->create( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_rate_limited', $result->get_error_code() );
	}

	public function test_revoke_returns_not_found_for_a_missing_key(): void {
		$this->withWorkspace();

		$request = new WP_REST_Request();
		$request->set_param( 'id', 999 );

		$result = $this->controller->revoke( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_not_found', $result->get_error_code() );
	}

	public function test_revoke_succeeds_for_a_key_owned_by_the_workspace(): void {
		$this->withWorkspace();
		$store = array();
		$this->fake_cache( $store );

		$create_request = new WP_REST_Request();
		$create_request->set_param( 'label', 'CI key' );
		$created = $this->controller->create( $create_request );

		$revoke_request = new WP_REST_Request();
		$revoke_request->set_param( 'id', $created->get_data()['key']['id'] );

		$response = $this->controller->revoke( $revoke_request );

		$this->assertSame( 200, $response->get_status() );
		$this->assertTrue( $response->get_data()['revoked'] );
	}

	public function test_regenerate_returns_not_found_for_a_missing_key(): void {
		$this->withWorkspace();

		$request = new WP_REST_Request();
		$request->set_param( 'id', 999 );

		$result = $this->controller->regenerate( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_not_found', $result->get_error_code() );
	}

	public function test_regenerate_rotates_the_key_and_logs_activity(): void {
		$workspace = $this->withWorkspace();
		$store     = array();
		$this->fake_cache( $store );

		$create_request = new WP_REST_Request();
		$create_request->set_param( 'label', 'CI key' );
		$created = $this->controller->create( $create_request );

		$regen_request = new WP_REST_Request();
		$regen_request->set_param( 'id', $created->get_data()['key']['id'] );

		$response = $this->controller->regenerate( $regen_request );

		$this->assertSame( 200, $response->get_status() );
		$this->assertNotSame( $created->get_data()['key']['plain'], $response->get_data()['key']['plain'] );

		$log = $this->container->get( ActivityService::class )->recent( $workspace['id'] );
		$this->assertSame( 'api_key_regenerated', $log[0]['event_type'] );
	}
}
