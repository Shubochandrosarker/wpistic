<?php
/**
 * Stand-in for WordPress's wp-admin/includes/upgrade.php, loaded by
 * Schema::install() purely to get a dbDelta() implementation. Records calls
 * instead of touching a real database, so tests can assert on what schema
 * install() actually asked for.
 *
 * @package WPistic\Core
 */

if ( ! function_exists( 'dbDelta' ) ) {
	function dbDelta( $queries = '' ) {
		$GLOBALS['wpistic_test_dbdelta_calls'][] = is_array( $queries ) ? $queries : array( $queries );
		return array();
	}
}
