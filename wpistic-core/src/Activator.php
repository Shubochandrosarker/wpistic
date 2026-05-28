<?php
/**
 * Activation routine.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core;

use WPistic\Core\Database\Schema;

defined( 'ABSPATH' ) || exit;

/**
 * Runs on plugin activation: tables, roles, capabilities.
 */
class Activator {

	/**
	 * Capabilities granted to workspace members.
	 *
	 * @return string[]
	 */
	public static function capabilities(): array {
		return array(
			'wpistic_access_dashboard',
			'wpistic_manage_workspace',
			'wpistic_manage_licenses',
			'wpistic_manage_websites',
			'wpistic_manage_billing',
			'wpistic_manage_api_keys',
		);
	}

	/**
	 * Activation entrypoint.
	 */
	public static function activate(): void {
		Schema::install();
		self::register_roles();
		update_option( 'wpistic_core_db_version', '1.0.0', false );

		// Dashboard rewrite rules live in the dashboard plugin; flush defensively.
		flush_rewrite_rules();

		do_action( 'wpistic_core_activated' );
	}

	/**
	 * Ensure the workspace role and capability grants exist. Idempotent.
	 */
	public static function register_roles(): void {
		$caps = array_fill_keys( self::capabilities(), true );

		// Dedicated customer role.
		if ( ! get_role( 'wpistic_member' ) ) {
			add_role(
				'wpistic_member',
				__( 'WPistic Member', 'wpistic-core' ),
				array_merge( array( 'read' => true ), $caps )
			);
		}

		// Administrators always have full access.
		$admin = get_role( 'administrator' );
		if ( $admin ) {
			foreach ( self::capabilities() as $cap ) {
				if ( ! $admin->has_cap( $cap ) ) {
					$admin->add_cap( $cap );
				}
			}
		}
	}
}
