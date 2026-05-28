<?php
/**
 * Plugin Name:       WPistic Core
 * Plugin URI:        https://wpistic.com/
 * Description:        Foundation plugin for the WPistic SaaS platform — custom tables, service layer, REST API, security, and integration adapters for Memberistic, Licenseistic, WPistic Auth Flow, and Bookingistic.
 * Version:           1.0.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            WPistic
 * Author URI:        https://wpistic.com/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wpistic-core
 *
 * @package WPistic\Core
 */

namespace WPistic\Core;

defined( 'ABSPATH' ) || exit;

define( 'WPISTIC_CORE_VERSION', '1.0.0' );
define( 'WPISTIC_CORE_FILE', __FILE__ );
define( 'WPISTIC_CORE_PATH', plugin_dir_path( __FILE__ ) );
define( 'WPISTIC_CORE_URL', plugin_dir_url( __FILE__ ) );

/**
 * PSR-4 style autoloader scoped to the WPistic\Core namespace.
 *
 * Avoids a hard Composer dependency so the plugin runs on any host.
 */
spl_autoload_register(
	static function ( $class ) {
		$prefix = 'WPistic\\Core\\';
		if ( 0 !== strpos( $class, $prefix ) ) {
			return;
		}
		$relative = substr( $class, strlen( $prefix ) );
		$path     = WPISTIC_CORE_PATH . 'src/' . str_replace( '\\', '/', $relative ) . '.php';
		if ( is_readable( $path ) ) {
			require $path;
		}
	}
);

register_activation_hook( __FILE__, array( Activator::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( Deactivator::class, 'deactivate' ) );

/**
 * Boot the plugin on plugins_loaded so integration plugins can register first.
 */
add_action(
	'plugins_loaded',
	static function () {
		Plugin::instance()->boot();
	},
	5
);
