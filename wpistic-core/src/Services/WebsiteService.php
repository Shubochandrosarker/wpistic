<?php
/**
 * Website service — connected sites and their tokens.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Services;

use WPistic\Core\Database\Tables;
use WPistic\Core\Support\Security;

defined( 'ABSPATH' ) || exit;

/**
 * Manages connected WordPress sites for a workspace.
 */
class WebsiteService {

	/**
	 * Workspace service dependency.
	 *
	 * @var WorkspaceService
	 */
	private WorkspaceService $workspaces;

	/**
	 * Constructor.
	 *
	 * @param WorkspaceService $workspaces Workspace service.
	 */
	public function __construct( WorkspaceService $workspaces ) {
		$this->workspaces = $workspaces;
	}

	/**
	 * List websites for a workspace.
	 *
	 * @param int $workspace_id Workspace id.
	 * @return array<int,array<string,mixed>>
	 */
	public function list_for_workspace( int $workspace_id ): array {
		global $wpdb;
		$table = Tables::name( Tables::WEBSITES );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE workspace_id = %d ORDER BY created_at DESC",
				$workspace_id
			),
			ARRAY_A
		);
		return array_map( array( $this, 'hydrate' ), $rows ?: array() );
	}

	/**
	 * Connect a new website. Returns the row plus a one-time plain token.
	 *
	 * @param int    $workspace_id Workspace id.
	 * @param string $url          Site URL.
	 * @param string $name         Friendly name.
	 * @return array{website:array,token:string}|null
	 */
	public function connect( int $workspace_id, string $url, string $name = '' ): ?array {
		$normalized = Security::normalize_url( $url );
		if ( null === $normalized ) {
			return null;
		}

		$token = bin2hex( random_bytes( 24 ) );
		$now   = current_time( 'mysql', true );

		global $wpdb;
		$wpdb->insert(
			Tables::name( Tables::WEBSITES ),
			array(
				'workspace_id' => $workspace_id,
				'url'          => $normalized,
				'name'         => sanitize_text_field( $name ?: wp_parse_url( $normalized, PHP_URL_HOST ) ),
				'status'       => 'pending',
				'token_hash'   => Security::hash_token( $token ),
				'created_at'   => $now,
			),
			array( '%d', '%s', '%s', '%s', '%s', '%s' )
		);

		$id = (int) $wpdb->insert_id;
		do_action( 'wpistic_website_connected', $id, $workspace_id );

		return array(
			'website' => $this->get( $id ),
			'token'   => $token, // Shown once, never stored in plain text.
		);
	}

	/**
	 * Fetch a single website.
	 *
	 * @param int $id Website id.
	 * @return array<string,mixed>|null
	 */
	public function get( int $id ): ?array {
		global $wpdb;
		$table = Tables::name( Tables::WEBSITES );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A );
		return $row ? $this->hydrate( $row ) : null;
	}

	/**
	 * Disconnect (delete) a website.
	 *
	 * @param int $id           Website id.
	 * @param int $workspace_id Owning workspace (guards cross-tenant deletes).
	 */
	public function disconnect( int $id, int $workspace_id ): bool {
		global $wpdb;
		$deleted = $wpdb->delete(
			Tables::name( Tables::WEBSITES ),
			array(
				'id'           => $id,
				'workspace_id' => $workspace_id,
			),
			array( '%d', '%d' )
		);
		return (bool) $deleted;
	}

	/**
	 * Normalize a DB row (token hash is never exposed).
	 *
	 * @param array<string,mixed> $row Raw row.
	 * @return array<string,mixed>
	 */
	private function hydrate( array $row ): array {
		return array(
			'id'                => (int) $row['id'],
			'workspace_id'      => (int) $row['workspace_id'],
			'url'               => (string) $row['url'],
			'name'              => (string) $row['name'],
			'status'            => (string) $row['status'],
			'connector_version' => $row['connector_version'] ? (string) $row['connector_version'] : null,
			'last_seen_at'      => $row['last_seen_at'],
			'meta'              => json_decode( (string) ( $row['meta'] ?? '{}' ), true ) ?: array(),
		);
	}
}
