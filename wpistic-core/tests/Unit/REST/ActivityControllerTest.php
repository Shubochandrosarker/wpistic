<?php
/**
 * Tests for WPistic\Core\REST\ActivityController.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\REST\ActivityController;
use WPistic\Core\Services\WorkspaceService;
use WPistic\Core\Services\ActivityService;
use WPistic\Core\Tests\Support\FakeWpdb;
use WPistic\Core\Tests\Support\TestServices;
use WP_Error;
use WP_REST_Request;

final class ActivityControllerTest extends TestCase {

	private $container;

	private ActivityController $controller;

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

		$this->container  = TestServices::container();
		$this->controller = new ActivityController( $this->container );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_index_returns_the_no_workspace_error_when_the_user_has_none(): void {
		$request = new WP_REST_Request();
		$request->set_param( 'limit', 25 );

		$result = $this->controller->index( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'wpistic_no_workspace', $result->get_error_code() );
	}

	public function test_index_returns_recent_activity_for_the_users_workspace(): void {
		$workspace = $this->container->get( WorkspaceService::class )->create( 7, 'Acme Inc' );
		$this->container->get( ActivityService::class )->record( $workspace['id'], 'website_connected' );

		$request = new WP_REST_Request();
		$request->set_param( 'limit', 25 );

		$response = $this->controller->index( $request );

		$this->assertSame( 200, $response->get_status() );
		$this->assertCount( 1, $response->get_data()['activity'] );
		$this->assertSame( 'website_connected', $response->get_data()['activity'][0]['event_type'] );
	}

	public function test_index_respects_the_limit_param(): void {
		$workspace = $this->container->get( WorkspaceService::class )->create( 7, 'Acme Inc' );
		$activity  = $this->container->get( ActivityService::class );
		$activity->record( $workspace['id'], 'a' );
		$activity->record( $workspace['id'], 'b' );
		$activity->record( $workspace['id'], 'c' );

		$request = new WP_REST_Request();
		$request->set_param( 'limit', 2 );

		$response = $this->controller->index( $request );

		$this->assertCount( 2, $response->get_data()['activity'] );
	}
}
