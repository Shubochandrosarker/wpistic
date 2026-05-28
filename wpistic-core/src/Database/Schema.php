<?php
/**
 * Schema definitions and migration runner.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Database;

defined( 'ABSPATH' ) || exit;

/**
 * Creates / upgrades the custom SaaS tables via dbDelta().
 */
class Schema {

	/**
	 * Option key tracking the installed schema version.
	 */
	private const VERSION_OPTION = 'wpistic_core_db_version';

	/**
	 * Current schema version. Bump to trigger dbDelta on upgrade.
	 */
	private const DB_VERSION = '1.0.0';

	/**
	 * Run install / upgrade when the schema version changes.
	 */
	public static function maybe_upgrade(): void {
		if ( get_option( self::VERSION_OPTION ) === self::DB_VERSION ) {
			return;
		}
		self::install();
		update_option( self::VERSION_OPTION, self::DB_VERSION, false );
	}

	/**
	 * Create or update all tables.
	 */
	public static function install(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset_collate = $wpdb->get_charset_collate();
		$workspaces      = Tables::name( Tables::WORKSPACES );
		$members         = Tables::name( Tables::WORKSPACE_MEMBERS );
		$websites        = Tables::name( Tables::WEBSITES );
		$activity        = Tables::name( Tables::ACTIVITY );
		$api_keys        = Tables::name( Tables::API_KEYS );

		$queries = array();

		$queries[] = "CREATE TABLE {$workspaces} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			slug VARCHAR(96) NOT NULL,
			name VARCHAR(191) NOT NULL,
			owner_user_id BIGINT UNSIGNED NOT NULL,
			plan_slug VARCHAR(64) NOT NULL DEFAULT 'free',
			plan_status VARCHAR(32) NOT NULL DEFAULT 'active',
			settings LONGTEXT NULL,
			created_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
			updated_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
			PRIMARY KEY  (id),
			UNIQUE KEY slug (slug),
			KEY owner_user_id (owner_user_id),
			KEY plan_status (plan_status)
		) {$charset_collate};";

		$queries[] = "CREATE TABLE {$members} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			workspace_id BIGINT UNSIGNED NOT NULL,
			user_id BIGINT UNSIGNED NOT NULL,
			role VARCHAR(32) NOT NULL DEFAULT 'member',
			status VARCHAR(32) NOT NULL DEFAULT 'active',
			invited_by BIGINT UNSIGNED NULL,
			created_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
			PRIMARY KEY  (id),
			UNIQUE KEY workspace_user (workspace_id, user_id),
			KEY user_id (user_id),
			KEY role (role)
		) {$charset_collate};";

		$queries[] = "CREATE TABLE {$websites} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			workspace_id BIGINT UNSIGNED NOT NULL,
			url VARCHAR(255) NOT NULL,
			name VARCHAR(191) NULL,
			status VARCHAR(32) NOT NULL DEFAULT 'pending',
			connector_version VARCHAR(32) NULL,
			token_hash CHAR(64) NULL,
			last_seen_at DATETIME NULL,
			meta LONGTEXT NULL,
			created_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
			PRIMARY KEY  (id),
			KEY workspace_id (workspace_id),
			KEY status (status),
			KEY token_hash (token_hash)
		) {$charset_collate};";

		$queries[] = "CREATE TABLE {$activity} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			workspace_id BIGINT UNSIGNED NOT NULL,
			user_id BIGINT UNSIGNED NULL,
			event_type VARCHAR(64) NOT NULL,
			object_type VARCHAR(64) NULL,
			object_id VARCHAR(64) NULL,
			message VARCHAR(255) NULL,
			context LONGTEXT NULL,
			created_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
			PRIMARY KEY  (id),
			KEY workspace_event (workspace_id, event_type),
			KEY created_at (created_at)
		) {$charset_collate};";

		$queries[] = "CREATE TABLE {$api_keys} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			workspace_id BIGINT UNSIGNED NOT NULL,
			user_id BIGINT UNSIGNED NOT NULL,
			label VARCHAR(191) NOT NULL,
			key_prefix VARCHAR(16) NOT NULL,
			key_hash CHAR(64) NOT NULL,
			scopes VARCHAR(255) NULL,
			last_used_at DATETIME NULL,
			revoked_at DATETIME NULL,
			created_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
			PRIMARY KEY  (id),
			KEY workspace_id (workspace_id),
			UNIQUE KEY key_hash (key_hash),
			KEY key_prefix (key_prefix)
		) {$charset_collate};";

		foreach ( $queries as $query ) {
			dbDelta( $query );
		}
	}
}
