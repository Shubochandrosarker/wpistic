<?php
/**
 * Activity log service.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Services;

use WPistic\Core\Database\Tables;

defined( 'ABSPATH' ) || exit;

/**
 * Records and reads the per-workspace activity feed.
 */
class ActivityService {

	/**
	 * Record an activity event.
	 *
	 * @param int                 $workspace_id Workspace id.
	 * @param string              $event_type   Machine event type.
	 * @param array<string,mixed> $args         message, user_id, object_type, object_id, context.
	 */
	public function record( int $workspace_id, string $event_type, array $args = array() ): void {
		global $wpdb;
		$wpdb->insert(
			Tables::name( Tables::ACTIVITY ),
			array(
				'workspace_id' => $workspace_id,
				'user_id'      => isset( $args['user_id'] ) ? (int) $args['user_id'] : null,
				'event_type'   => sanitize_key( $event_type ),
				'object_type'  => isset( $args['object_type'] ) ? sanitize_key( $args['object_type'] ) : null,
				'object_id'    => isset( $args['object_id'] ) ? sanitize_text_field( (string) $args['object_id'] ) : null,
				'message'      => isset( $args['message'] ) ? sanitize_text_field( $args['message'] ) : null,
				'context'      => isset( $args['context'] ) ? wp_json_encode( $args['context'] ) : null,
				'created_at'   => current_time( 'mysql', true ),
			),
			array( '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s' )
		);
	}

	/**
	 * Read recent activity for a workspace.
	 *
	 * @param int $workspace_id Workspace id.
	 * @param int $limit        Max rows (capped at 100).
	 * @return array<int,array<string,mixed>>
	 */
	public function recent( int $workspace_id, int $limit = 25 ): array {
		global $wpdb;
		$limit = max( 1, min( 100, $limit ) );
		$table = Tables::name( Tables::ACTIVITY );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE workspace_id = %d ORDER BY created_at DESC LIMIT %d",
				$workspace_id,
				$limit
			),
			ARRAY_A
		);
		return array_map(
			static function ( $row ) {
				return array(
					'id'          => (int) $row['id'],
					'event_type'  => (string) $row['event_type'],
					'object_type' => $row['object_type'],
					'object_id'   => $row['object_id'],
					'message'     => (string) $row['message'],
					'context'     => json_decode( (string) ( $row['context'] ?? '{}' ), true ) ?: array(),
					'created_at'  => $row['created_at'],
				);
			},
			$rows ?: array()
		);
	}
}
