<?php
/**
 * Plugin Name:       Licenseistic ⇄ Memberistic Bridge
 * Plugin URI:        https://wpistic.com/
 * Description:        Maps active Memberistic plans to Licenseistic product/license entitlements. Listens for subscription lifecycle events and grants, suspends, restores, or re-scopes licenses accordingly.
 * Version:           1.0.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            WPistic
 * License:           GPL-2.0-or-later
 * Text Domain:       licenseistic-memberistic-addon
 *
 * @package WPistic\Bridge
 */

namespace WPistic\Bridge;

defined( 'ABSPATH' ) || exit;

define( 'WPISTIC_BRIDGE_VERSION', '1.0.0' );
define( 'WPISTIC_BRIDGE_PATH', plugin_dir_path( __FILE__ ) );

spl_autoload_register(
	static function ( $class ) {
		$prefix = 'WPistic\\Bridge\\';
		if ( 0 !== strpos( $class, $prefix ) ) {
			return;
		}
		$relative = substr( $class, strlen( $prefix ) );
		$path     = WPISTIC_BRIDGE_PATH . 'src/' . str_replace( '\\', '/', $relative ) . '.php';
		if ( is_readable( $path ) ) {
			require $path;
		}
	}
);

add_action(
	'plugins_loaded',
	static function () {
		( new Bridge() )->register();
	},
	20 // After core (5) and sibling plugins.
);
