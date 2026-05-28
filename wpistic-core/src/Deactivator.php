<?php
/**
 * Deactivation routine.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Runs on plugin deactivation. Data tables are preserved; only transient
 * state and rewrite rules are cleared.
 */
class Deactivator {

	/**
	 * Deactivation entrypoint.
	 */
	public static function deactivate(): void {
		flush_rewrite_rules();
		do_action( 'wpistic_core_deactivated' );
	}
}
