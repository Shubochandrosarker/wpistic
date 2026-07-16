<?php
/**
 * Tests for WPistic\Core\Services\WorkspaceService — tenant resolution and
 * role-based authorization.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\Services\WorkspaceService;
use WPistic\Core\Tests\Support\FakeWpdb;

final class WorkspaceServiceTest extends TestCase {

	private FakeWpdb $wpdb;

	private WorkspaceService $service;

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
		Functions\when( 'sanitize_title' )->alias(
			static fn( $v ) => trim( preg_replace( '/[^a-z0-9\-]/', '-', strtolower( (string) $v ) ), '-' )
		);
		Functions\when( 'wp_json_encode' )->alias( static fn( $v ) => json_encode( $v ) );
		Functions\when( 'do_action' )->justReturn( null );

		$this->service = new WorkspaceService();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	// ── get_for_user ─────────────────────────────────────────────

	public function test_get_for_user_returns_null_with_no_membership(): void {
		$this->assertNull( $this->service->get_for_user( 1 ) );
	}

	public function test_get_for_user_returns_the_workspace_for_an_active_member(): void {
		$workspace = $this->service->create( 1, 'Acme Inc' );

		$found = $this->service->get_for_user( 1 );

		$this->assertSame( $workspace['id'], $found['id'] );
		$this->assertSame( 'owner', $found['role'] );
		$this->assertSame( 'free', $found['plan_slug'] );
	}

	public function test_get_for_user_ignores_an_inactive_membership(): void {
		$this->service->create( 1, 'Acme Inc' );
		$workspace_id = $this->service->get_for_user( 1 )['id'];

		$this->wpdb->update(
			$this->wpdb->prefix . 'wpistic_workspace_members',
			array( 'status' => 'invited' ),
			array(
				'workspace_id' => $workspace_id,
				'user_id'      => 1,
			)
		);

		$this->assertNull( $this->service->get_for_user( 1 ) );
	}

	// ── create ───────────────────────────────────────────────────

	public function test_create_adds_the_owner_as_an_active_member(): void {
		$workspace = $this->service->create( 42, 'My Workspace' );

		$this->assertSame( 42, $workspace['owner'] );
		$this->assertSame( 'owner', $workspace['role'] );
	}

	public function test_create_generates_a_unique_slug_on_collision(): void {
		$first  = $this->service->create( 1, 'Acme' );
		$second = $this->service->create( 2, 'Acme' );

		$this->assertSame( 'acme', $first['slug'] );
		$this->assertNotSame( $first['slug'], $second['slug'] );
		$this->assertSame( 'acme-2', $second['slug'] );
	}

	// ── set_plan ─────────────────────────────────────────────────

	public function test_set_plan_updates_the_users_workspace(): void {
		$this->service->create( 1, 'Acme Inc' );

		$this->service->set_plan( 1, 'pro', 'active' );

		$workspace = $this->service->get_for_user( 1 );
		$this->assertSame( 'pro', $workspace['plan_slug'] );
		$this->assertSame( 'active', $workspace['plan_status'] );
	}

	public function test_set_plan_is_a_no_op_for_a_user_without_a_workspace(): void {
		// Must not throw even though there is nothing to update.
		$this->service->set_plan( 999, 'pro', 'active' );
		$this->assertNull( $this->service->get_for_user( 999 ) );
	}

	// ── user_can_access / role_rank ──────────────────────────────

	public function test_user_can_access_allows_a_member_meeting_the_minimum_role(): void {
		$workspace = $this->service->create( 1, 'Acme Inc' );

		$this->assertTrue( $this->service->user_can_access( 1, $workspace['id'], 'admin' ) );
	}

	public function test_user_can_access_denies_a_member_below_the_minimum_role(): void {
		$workspace = $this->service->create( 1, 'Acme Inc' );
		$this->add_member( $workspace['id'], 2, 'viewer' );

		$this->assertFalse( $this->service->user_can_access( 2, $workspace['id'], 'admin' ) );
	}

	public function test_user_can_access_fails_closed_for_an_unrecognized_role(): void {
		$workspace = $this->service->create( 1, 'Acme Inc' );
		$this->add_member( $workspace['id'], 2, 'superadmin' );

		$this->assertFalse( $this->service->user_can_access( 2, $workspace['id'], 'viewer' ) );
	}

	public function test_user_can_access_denies_an_inactive_membership(): void {
		$workspace = $this->service->create( 1, 'Acme Inc' );
		$this->add_member( $workspace['id'], 2, 'owner', 'invited' );

		$this->assertFalse( $this->service->user_can_access( 2, $workspace['id'], 'viewer' ) );
	}

	public function test_user_can_access_denies_a_cross_tenant_workspace_id_probe(): void {
		$workspace_a = $this->service->create( 1, 'Acme Inc' );
		$workspace_b = $this->service->create( 2, 'Other Co' );

		// User 1 is the owner of workspace A only — probing workspace B's id
		// must not grant access even though user 1 has SOME valid membership.
		$this->assertFalse( $this->service->user_can_access( 1, $workspace_b['id'], 'viewer' ) );
		$this->assertTrue( $this->service->user_can_access( 1, $workspace_a['id'], 'viewer' ) );
	}

	public function test_role_rank_returns_zero_for_an_unknown_role(): void {
		$this->assertSame( 0, $this->service->role_rank( 'superadmin' ) );
	}

	public function test_role_rank_orders_known_roles_correctly(): void {
		$this->assertTrue( $this->service->role_rank( 'owner' ) > $this->service->role_rank( 'admin' ) );
		$this->assertTrue( $this->service->role_rank( 'admin' ) > $this->service->role_rank( 'member' ) );
		$this->assertTrue( $this->service->role_rank( 'member' ) > $this->service->role_rank( 'viewer' ) );
	}

	private function add_member( int $workspace_id, int $user_id, string $role, string $status = 'active' ): void {
		$this->wpdb->insert(
			$this->wpdb->prefix . 'wpistic_workspace_members',
			array(
				'workspace_id' => $workspace_id,
				'user_id'      => $user_id,
				'role'         => $role,
				'status'       => $status,
				'created_at'   => '2026-01-01 00:00:00',
			)
		);
	}
}
