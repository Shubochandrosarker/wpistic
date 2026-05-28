<?php
/**
 * Plugin Name:       WPistic Dashboard
 * Plugin URI:        https://wpistic.com/
 * Description:        Mounts the WPistic React app at /dashboard with client-side routing, loads its bundle only on dashboard routes, and localizes the WPistic boot object.
 * Version:           1.0.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            WPistic
 * License:           GPL-2.0-or-later
 * Text Domain:       wpistic-dashboard
 *
 * @package WPistic\Dashboard
 */

namespace WPistic\Dashboard;

defined( 'ABSPATH' ) || exit;

define( 'WPISTIC_DASH_VERSION', '1.0.0' );
define( 'WPISTIC_DASH_FILE', __FILE__ );
define( 'WPISTIC_DASH_PATH', plugin_dir_path( __FILE__ ) );
define( 'WPISTIC_DASH_URL', plugin_dir_url( __FILE__ ) );

spl_autoload_register(
	static function ( $class ) {
		$prefix = 'WPistic\\Dashboard\\';
		if ( 0 !== strpos( $class, $prefix ) ) {
			return;
		}
		$relative = substr( $class, strlen( $prefix ) );
		$path     = WPISTIC_DASH_PATH . 'src/php/' . str_replace( '\\', '/', $relative ) . '.php';
		if ( is_readable( $path ) ) {
			require $path;
		}
	}
);

register_activation_hook(
	__FILE__,
	static function () {
		Router::add_rewrite_rules();
		flush_rewrite_rules();
	}
);

register_deactivation_hook(
	__FILE__,
	static function () {
		flush_rewrite_rules();
	}
);

add_action(
	'plugins_loaded',
	static function () {
		( new Router() )->register();
		( new Assets() )->register();
	},
	10
);
