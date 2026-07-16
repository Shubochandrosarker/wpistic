<?php
/**
 * Tests for WPistic\Core\Services\WebsiteService — connected-site
 * management and cross-tenant delete isolation.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\Services\WebsiteService;
use WPistic\Core\Services\WorkspaceService;
use WPistic\Core\Tests\Support\FakeWpdb;

final class WebsiteServiceTest extends TestCase {

	private FakeWpdb $wpdb;

	private WebsiteService $service;

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
		Functions\when( 'wp_parse_url' )->alias(
			static fn( $url, $component ) => parse_url( $url, $component )
		);
		Functions\when( 'do_action' )->justReturn( null );

		// Security::normalize_url() dependencies.
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		Functions\when( 'wp_http_validate_url' )->justReturn( true );
		Functions\when( 'untrailingslashit' )->alias( static fn( $url ) => rtrim( $url, '/' ) );
		// Security::hash_token() dependency.
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );

		$this->service = new WebsiteService( new WorkspaceService() );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_connect_rejects_an_invalid_url_without_touching_the_database(): void {
		Functions\when( 'wp_http_validate_url' )->justReturn( false );

		$this->assertNull( $this->service->connect( 1, 'not a url' ) );
		$this->assertSame( array(), $this->service->list_for_workspace( 1 ) );
	}

	public function test_connect_stores_a_hashed_token_and_returns_the_plain_value_once(): void {
		$result = $this->service->connect( 1, 'https://example.com/', 'Example' );

		$this->assertNotNull( $result );
		$this->assertSame( 'https://example.com', $result['website']['url'] );
		$this->assertSame( 'Example', $result['website']['name'] );
		$this->assertSame( 'pending', $result['website']['status'] );
		$this->assertIsString( $result['token'] );

		$stored = $this->wpdb->tables[ $this->wpdb->prefix . 'wpistic_websites' ][1];
		$this->assertArrayNotHasKey( 'token', $stored );
		$this->assertNotSame( $result['token'], $stored['token_hash'] );
	}

	public function test_connect_derives_a_name_from_the_host_when_none_given(): void {
		$result = $this->service->connect( 1, 'https://sub.example.com' );

		$this->assertSame( 'sub.example.com', $result['website']['name'] );
	}

	public function test_list_for_workspace_only_returns_that_workspaces_sites(): void {
		$this->service->connect( 1, 'https://a.example.com' );
		$this->service->connect( 2, 'https://b.example.com' );
		$this->service->connect( 1, 'https://c.example.com' );

		$sites = $this->service->list_for_workspace( 1 );

		$this->assertCount( 2, $sites );
		foreach ( $sites as $site ) {
			$this->assertSame( 1, $site['workspace_id'] );
		}
	}

	public function test_disconnect_removes_a_website_owned_by_the_workspace(): void {
		$connected = $this->service->connect( 1, 'https://a.example.com' );

		$removed = $this->service->disconnect( $connected['website']['id'], 1 );

		$this->assertTrue( $removed );
		$this->assertNull( $this->service->get( $connected['website']['id'] ) );
	}

	/**
	 * The multi-tenant isolation guard: a user scoped to workspace B must
	 * not be able to delete workspace A's website by guessing its id.
	 */
	public function test_disconnect_refuses_a_cross_tenant_delete(): void {
		$connected = $this->service->connect( 1, 'https://a.example.com' );

		$removed = $this->service->disconnect( $connected['website']['id'], 2 );

		$this->assertFalse( $removed );
		$this->assertNotNull( $this->service->get( $connected['website']['id'] ) );
	}

	public function test_disconnect_returns_false_for_a_nonexistent_id(): void {
		$this->assertFalse( $this->service->disconnect( 999, 1 ) );
	}
}
