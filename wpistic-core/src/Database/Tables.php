<?php
/**
 * Table name registry.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Database;

defined( 'ABSPATH' ) || exit;

/**
 * Central source of truth for custom table names.
 *
 * High-volume SaaS data lives in these dedicated tables, never in
 * postmeta / usermeta.
 */
class Tables {

	public const WORKSPACES        = 'wpistic_workspaces';
	public const WORKSPACE_MEMBERS = 'wpistic_workspace_members';
	public const WEBSITES          = 'wpistic_websites';
	public const ACTIVITY          = 'wpistic_activity_log';
	public const API_KEYS          = 'wpistic_api_keys';

	/**
	 * Resolve a fully-prefixed table name.
	 *
	 * @param string $table One of the class constants.
	 */
	public static function name( string $table ): string {
		global $wpdb;
		return $wpdb->prefix . $table;
	}

	/**
	 * All managed table identifiers.
	 *
	 * @return string[]
	 */
	public static function all(): array {
		return array(
			self::WORKSPACES,
			self::WORKSPACE_MEMBERS,
			self::WEBSITES,
			self::ACTIVITY,
			self::API_KEYS,
		);
	}
}
