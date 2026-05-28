<?php
/**
 * Workspace service — workspaces, membership, roles, plan limits.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Services;

use WPistic\Core\Database\Tables;

defined( 'ABSPATH' ) || exit;

/**
 * Owns workspace CRUD and membership/role resolution.
 */
class WorkspaceService {

	/**
	 * Resolve (or lazily create) the active workspace for a user.
	 *
	 * @param int $user_id WordPress user id.
	 * @return array<string,mixed>|null
	 */
	public function get_for_user( int $user_id ): ?array {
		global $wpdb;
		$members    = Tables::name( Tables::WORKSPACE_MEMBERS );
		$workspaces = Tables::name( Tables::WORKSPACES );

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table names are internal constants.
		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT w.*, m.role AS member_role, m.status AS member_status
				 FROM {$workspaces} w
				 INNER JOIN {$members} m ON m.workspace_id = w.id
				 WHERE m.user_id = %d AND m.status = 'active'
				 ORDER BY w.id ASC LIMIT 1",
				$user_id
			),
			ARRAY_A
		);

		if ( ! $row ) {
			return null;
		}
		return $this->hydrate( $row );
	}

	/**
	 * Create a workspace and add the owner as a member.
	 *
	 * @param int                  $owner_id WordPress user id.
	 * @param string               $name     Workspace name.
	 * @param array<string,mixed>  $args     Optional plan_slug, settings.
	 * @return array<string,mixed>
	 */
	public function create( int $owner_id, string $name, array $args = array() ): array {
		global $wpdb;
		$workspaces = Tables::name( Tables::WORKSPACES );
		$members    = Tables::name( Tables::WORKSPACE_MEMBERS );
		$now        = current_time( 'mysql', true );

		$slug = $this->unique_slug( sanitize_title( $name ) ?: 'workspace' );

		$wpdb->insert(
			$workspaces,
			array(
				'slug'          => $slug,
				'name'          => sanitize_text_field( $name ),
				'owner_user_id' => $owner_id,
				'plan_slug'     => sanitize_key( $args['plan_slug'] ?? 'free' ),
				'plan_status'   => 'active',
				'settings'      => wp_json_encode( $args['settings'] ?? array() ),
				'created_at'    => $now,
				'updated_at'    => $now,
			),
			array( '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s' )
		);
		$workspace_id = (int) $wpdb->insert_id;

		$wpdb->insert(
			$members,
			array(
				'workspace_id' => $workspace_id,
				'user_id'      => $owner_id,
				'role'         => 'owner',
				'status'       => 'active',
				'created_at'   => $now,
			),
			array( '%d', '%d', '%s', '%s', '%s' )
		);

		do_action( 'wpistic_workspace_created', $workspace_id, $owner_id );

		return $this->get_for_user( $owner_id ) ?? array();
	}

	/**
	 * Update a user's plan on their workspace (called by the bridge).
	 *
	 * @param int    $user_id   WordPress user id.
	 * @param string $plan_slug Plan slug.
	 * @param string $status    Plan status.
	 */
	public function set_plan( int $user_id, string $plan_slug, string $status = 'active' ): void {
		$workspace = $this->get_for_user( $user_id );
		if ( ! $workspace ) {
			return;
		}
		global $wpdb;
		$wpdb->update(
			Tables::name( Tables::WORKSPACES ),
			array(
				'plan_slug'   => sanitize_key( $plan_slug ),
				'plan_status' => sanitize_key( $status ),
				'updated_at'  => current_time( 'mysql', true ),
			),
			array( 'id' => $workspace['id'] ),
			array( '%s', '%s', '%s' ),
			array( '%d' )
		);
	}

	/**
	 * Determine whether a user is a member with at least the given role.
	 *
	 * @param int    $user_id      WordPress user id.
	 * @param int    $workspace_id Workspace id.
	 * @param string $min_role     Minimum role: owner|admin|member|viewer.
	 */
	public function user_can_access( int $user_id, int $workspace_id, string $min_role = 'viewer' ): bool {
		global $wpdb;
		$members = Tables::name( Tables::WORKSPACE_MEMBERS );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$role = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT role FROM {$members} WHERE user_id = %d AND workspace_id = %d AND status = 'active' LIMIT 1",
				$user_id,
				$workspace_id
			)
		);
		if ( ! $role ) {
			return false;
		}
		return $this->role_rank( $role ) >= $this->role_rank( $min_role );
	}

	/**
	 * Numeric ranking for roles (higher = more privileged).
	 *
	 * @param string $role Role slug.
	 */
	public function role_rank( string $role ): int {
		$ranks = array(
			'viewer' => 1,
			'member' => 2,
			'admin'  => 3,
			'owner'  => 4,
		);
		return $ranks[ $role ] ?? 0;
	}

	/**
	 * Normalize a DB row into an API-friendly array.
	 *
	 * @param array<string,mixed> $row Raw DB row.
	 * @return array<string,mixed>
	 */
	private function hydrate( array $row ): array {
		return array(
			'id'          => (int) $row['id'],
			'slug'        => (string) $row['slug'],
			'name'        => (string) $row['name'],
			'owner'       => (int) $row['owner_user_id'],
			'plan_slug'   => (string) $row['plan_slug'],
			'plan_status' => (string) $row['plan_status'],
			'role'        => (string) ( $row['member_role'] ?? 'member' ),
			'settings'    => json_decode( (string) ( $row['settings'] ?? '{}' ), true ) ?: array(),
		);
	}

	/**
	 * Generate a unique workspace slug.
	 *
	 * @param string $base Base slug.
	 */
	private function unique_slug( string $base ): string {
		global $wpdb;
		$table = Tables::name( Tables::WORKSPACES );
		$slug  = $base;
		$i     = 1;
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		while ( $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE slug = %s", $slug ) ) ) {
			$slug = $base . '-' . ( ++$i );
		}
		return $slug;
	}
}
