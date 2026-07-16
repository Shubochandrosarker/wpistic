<?php
/**
 * Tests for WPistic\Core\Services\ApiKeyService — hashed API key
 * lifecycle and cross-tenant isolation.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\Services\ApiKeyService;
use WPistic\Core\Tests\Support\FakeWpdb;

final class ApiKeyServiceTest extends TestCase {

	private FakeWpdb $wpdb;

	private ApiKeyService $service;

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
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );

		$this->service = new ApiKeyService();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_create_returns_the_plain_key_once_and_stores_only_a_hash(): void {
		$key = $this->service->create( 1, 7, 'CI key', array( 'read', 'write' ) );

		$this->assertMatchesRegularExpression( '/^wpk_[0-9a-f]{8}\.[0-9a-f]{48}$/', $key['plain'] );

		$stored = $this->wpdb->tables[ $this->wpdb->prefix . 'wpistic_api_keys' ][1];
		$this->assertArrayNotHasKey( 'plain', $stored );
		$this->assertSame( $key['prefix'], $stored['key_prefix'] );
		$this->assertNotSame( $key['plain'], $stored['key_hash'] );
		$this->assertSame( 'read,write', $stored['scopes'] );
	}

	public function test_list_for_workspace_only_returns_that_workspaces_keys_and_hides_the_hash(): void {
		$this->service->create( 1, 7, 'Key A' );
		$this->service->create( 2, 7, 'Key B' );

		$keys = $this->service->list_for_workspace( 1 );

		$this->assertCount( 1, $keys );
		$this->assertSame( 'Key A', $keys[0]['label'] );
		$this->assertArrayNotHasKey( 'key_hash', $keys[0] );
		$this->assertFalse( $keys[0]['revoked'] );
	}

	public function test_revoke_marks_a_key_revoked_for_its_own_workspace(): void {
		$key = $this->service->create( 1, 7, 'CI key' );

		$revoked = $this->service->revoke( $key['id'], 1 );

		$this->assertTrue( $revoked );
		$this->assertTrue( $this->service->list_for_workspace( 1 )[0]['revoked'] );
	}

	/**
	 * Cross-tenant guard: workspace B must not be able to revoke a key that
	 * belongs to workspace A by guessing its id.
	 */
	public function test_revoke_refuses_a_cross_tenant_request(): void {
		$key = $this->service->create( 1, 7, 'CI key' );

		$revoked = $this->service->revoke( $key['id'], 2 );

		$this->assertFalse( $revoked );
		$this->assertFalse( $this->service->list_for_workspace( 1 )[0]['revoked'] );
	}

	public function test_regenerate_revokes_the_old_key_and_issues_a_new_one_with_the_same_label_and_scopes(): void {
		$original = $this->service->create( 1, 7, 'CI key', array( 'read', 'write' ) );

		$next = $this->service->regenerate( $original['id'], 1, 7 );

		$this->assertNotNull( $next );
		$this->assertNotSame( $original['plain'], $next['plain'] );
		$this->assertSame( 'CI key', $next['label'] );

		$keys = $this->service->list_for_workspace( 1 );
		$this->assertCount( 2, $keys );
		$original_row = array_values(
			array_filter( $keys, static fn( $k ) => $k['id'] === $original['id'] )
		)[0];
		$this->assertTrue( $original_row['revoked'] );
	}

	/**
	 * Cross-tenant guard: workspace B must not be able to regenerate (and
	 * thereby learn about / rotate) a key belonging to workspace A.
	 */
	public function test_regenerate_refuses_a_cross_tenant_request_and_changes_nothing(): void {
		$original = $this->service->create( 1, 7, 'CI key' );

		$result = $this->service->regenerate( $original['id'], 2, 99 );

		$this->assertNull( $result );
		$this->assertCount( 1, $this->service->list_for_workspace( 1 ) );
		$this->assertFalse( $this->service->list_for_workspace( 1 )[0]['revoked'] );
	}

	public function test_regenerate_returns_null_for_a_nonexistent_key(): void {
		$this->assertNull( $this->service->regenerate( 999, 1, 7 ) );
	}
}
