<?php
/**
 * API key service — issue, list, revoke developer API keys.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Services;

use WPistic\Core\Database\Tables;
use WPistic\Core\Support\Security;

defined( 'ABSPATH' ) || exit;

/**
 * Manages hashed API keys for the Developers area.
 *
 * Raw keys are returned exactly once at creation; only a keyed hash and a
 * short display prefix are persisted.
 */
class ApiKeyService {

	/**
	 * Create an API key.
	 *
	 * @param int    $workspace_id Workspace id.
	 * @param int    $user_id      Creator user id.
	 * @param string $label        Human label.
	 * @param array  $scopes       Scope strings.
	 * @return array{id:int,label:string,prefix:string,plain:string}
	 */
	public function create( int $workspace_id, int $user_id, string $label, array $scopes = array() ): array {
		$key = Security::generate_api_key();

		global $wpdb;
		$wpdb->insert(
			Tables::name( Tables::API_KEYS ),
			array(
				'workspace_id' => $workspace_id,
				'user_id'      => $user_id,
				'label'        => sanitize_text_field( $label ),
				'key_prefix'   => $key['prefix'],
				'key_hash'     => Security::hash_token( $key['secret'] ),
				'scopes'       => implode( ',', array_map( 'sanitize_key', $scopes ) ),
				'created_at'   => current_time( 'mysql', true ),
			),
			array( '%d', '%d', '%s', '%s', '%s', '%s', '%s' )
		);

		return array(
			'id'     => (int) $wpdb->insert_id,
			'label'  => sanitize_text_field( $label ),
			'prefix' => $key['prefix'],
			'plain'  => $key['plain'], // Shown once.
		);
	}

	/**
	 * List keys for a workspace (never exposes hashes).
	 *
	 * @param int $workspace_id Workspace id.
	 * @return array<int,array<string,mixed>>
	 */
	public function list_for_workspace( int $workspace_id ): array {
		global $wpdb;
		$table = Tables::name( Tables::API_KEYS );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT id, label, key_prefix, scopes, last_used_at, revoked_at, created_at
				 FROM {$table} WHERE workspace_id = %d ORDER BY created_at DESC",
				$workspace_id
			),
			ARRAY_A
		);
		return array_map(
			static function ( $row ) {
				return array(
					'id'           => (int) $row['id'],
					'label'        => (string) $row['label'],
					'prefix'       => (string) $row['key_prefix'],
					'scopes'       => array_filter( explode( ',', (string) $row['scopes'] ) ),
					'last_used_at' => $row['last_used_at'],
					'revoked'      => ! empty( $row['revoked_at'] ),
					'created_at'   => $row['created_at'],
				);
			},
			$rows ?: array()
		);
	}

	/**
	 * Revoke a key (soft delete).
	 *
	 * @param int $id           Key id.
	 * @param int $workspace_id Owning workspace.
	 */
	public function revoke( int $id, int $workspace_id ): bool {
		global $wpdb;
		return (bool) $wpdb->update(
			Tables::name( Tables::API_KEYS ),
			array( 'revoked_at' => current_time( 'mysql', true ) ),
			array(
				'id'           => $id,
				'workspace_id' => $workspace_id,
			),
			array( '%s' ),
			array( '%d', '%d' )
		);
	}

	/**
	 * Regenerate a key: revoke the old row and issue a fresh one with the same label/scopes.
	 *
	 * @param int $id           Key id.
	 * @param int $workspace_id Owning workspace.
	 * @param int $user_id      Acting user.
	 * @return array{id:int,label:string,prefix:string,plain:string}|null
	 */
	public function regenerate( int $id, int $workspace_id, int $user_id ): ?array {
		global $wpdb;
		$table = Tables::name( Tables::API_KEYS );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT label, scopes FROM {$table} WHERE id = %d AND workspace_id = %d",
				$id,
				$workspace_id
			),
			ARRAY_A
		);
		if ( ! $row ) {
			return null;
		}
		$this->revoke( $id, $workspace_id );
		return $this->create(
			$workspace_id,
			$user_id,
			(string) $row['label'],
			array_filter( explode( ',', (string) $row['scopes'] ) )
		);
	}
}
