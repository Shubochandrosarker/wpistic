<?php
/**
 * Tests for WPistic\Core\REST\WorkspaceController.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\REST\WorkspaceController;
use WPistic\Core\Services\WorkspaceService;
use WPistic\Core\Tests\Support\FakeWpdb;
use WPistic\Core\Tests\Support\TestServices;
use WP_REST_Request;

final class WorkspaceControllerTest extends TestCase {

	private $container;

	private WorkspaceController $controller;

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
		$this->controller = new WorkspaceController( $this->container );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_get_workspace_returns_null_when_the_user_has_none(): void {
		$response = $this->controller->get_workspace( new WP_REST_Request() );

		$this->assertSame( 200, $response->get_status() );
		$this->assertNull( $response->get_data()['workspace'] );
	}

	public function test_get_workspace_returns_the_users_existing_workspace(): void {
		$this->container->get( WorkspaceService::class )->create( 7, 'Acme Inc' );

		$response = $this->controller->get_workspace( new WP_REST_Request() );

		$this->assertSame( 'Acme Inc', $response->get_data()['workspace']['name'] );
	}

	public function test_create_workspace_creates_one_for_the_current_user(): void {
		$request = new WP_REST_Request();
		$request->set_param( 'name', 'My New Workspace' );
		$request->set_param( 'plan', 'pro' );

		$response = $this->controller->create_workspace( $request );

		$this->assertSame( 201, $response->get_status() );
		$this->assertSame( 'My New Workspace', $response->get_data()['workspace']['name'] );
		$this->assertSame( 'pro', $response->get_data()['workspace']['plan_slug'] );
	}

	public function test_create_workspace_defaults_to_the_free_plan_when_none_is_given(): void {
		$request = new WP_REST_Request();
		$request->set_param( 'name', 'My New Workspace' );

		$response = $this->controller->create_workspace( $request );

		$this->assertSame( 'free', $response->get_data()['workspace']['plan_slug'] );
	}
}
