<?php
/**
 * Tests for WPistic\Core\REST\MeController.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\REST\MeController;
use WPistic\Core\Tests\Support\FakeWpdb;
use WPistic\Core\Tests\Support\TestServices;
use WP_REST_Request;

final class MeControllerTest extends TestCase {

	private FakeWpdb $wpdb;

	private MeController $controller;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		global $wpdb;
		$wpdb       = new FakeWpdb();
		$this->wpdb = $wpdb;

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
		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );
		Functions\when( 'get_current_user_id' )->justReturn( 7 );
		Functions\when( 'get_avatar_url' )->justReturn( 'https://example.com/avatar.png' );
		Functions\when( 'wp_get_current_user' )->justReturn(
			(object) array(
				'display_name' => 'Ada Lovelace',
				'user_email'   => 'ada@example.com',
				'roles'        => array( 'administrator' ),
			)
		);

		$this->controller = new MeController( TestServices::container() );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_get_me_reports_a_null_workspace_when_the_user_has_none(): void {
		$response = $this->controller->get_me( new WP_REST_Request() );

		$data = $response->get_data();
		$this->assertNull( $data['workspace'] );
		$this->assertSame( 200, $response->get_status() );
	}

	public function test_get_me_includes_the_users_workspace_when_one_exists(): void {
		$container        = TestServices::container();
		$this->controller = new MeController( $container );
		$container->get( \WPistic\Core\Services\WorkspaceService::class )->create( 7, 'Acme Inc' );

		$response = $this->controller->get_me( new WP_REST_Request() );

		$data = $response->get_data();
		$this->assertSame( 'Acme Inc', $data['workspace']['name'] );
	}

	public function test_get_me_reports_user_identity_and_module_availability(): void {
		$response = $this->controller->get_me( new WP_REST_Request() );

		$data = $response->get_data();
		$this->assertSame( 7, $data['user']['id'] );
		$this->assertSame( 'Ada Lovelace', $data['user']['name'] );
		$this->assertSame( 'ada@example.com', $data['user']['email'] );
		$this->assertSame( array( 'administrator' ), $data['user']['roles'] );
		$this->assertArrayHasKey( 'memberistic', $data['modules'] );
		$this->assertFalse( $data['modules']['memberistic'] );
	}

	public function test_get_me_resolves_the_fallback_free_plan_when_memberistic_is_absent(): void {
		$response = $this->controller->get_me( new WP_REST_Request() );

		$data = $response->get_data();
		$this->assertSame( 'free', $data['plan']['slug'] );
		$this->assertSame( 'active', $data['plan']['status'] );
	}
}
