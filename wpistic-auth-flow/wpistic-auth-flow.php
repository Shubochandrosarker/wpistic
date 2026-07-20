<?php
/**
 * Plugin Name: WPistic Auth Flow
 * Plugin URI: https://wpistic.com
 * Description: Branded, WordPress-free /login and /register pages plus the wpistic-auth/v1 REST API used by the WPistic dashboard.
 * Version: 1.0.0
 * Author: WPistic
 * Text Domain: wpistic-auth-flow
 *
 * @package WPistic\Auth
 */

namespace WPistic\Auth;

defined( 'ABSPATH' ) || exit;

define( 'WPISTIC_AUTH_VERSION', '1.0.0' );
define( 'WPISTIC_AUTH_FILE', __FILE__ );
define( 'WPISTIC_AUTH_PATH', plugin_dir_path( __FILE__ ) );
define( 'WPISTIC_AUTH_URL', plugin_dir_url( __FILE__ ) );

require_once WPISTIC_AUTH_PATH . 'src/Plugin.php';
require_once WPISTIC_AUTH_PATH . 'src/Router.php';
require_once WPISTIC_AUTH_PATH . 'src/REST/AuthController.php';

/**
 * Boot the plugin (also satisfies WPistic Core's function_exists() capability check).
                     */
function wpistic_auth(): Plugin {
  	static $instance;
  	if ( ! $instance ) {
      		$instance = new Plugin();
    }
  	return $instance;
}

add_action( 'plugins_loaded', __NAMESPACE__ . '\\wpistic_auth' );

register_activation_hook(
  	__FILE__,
  	function () {
      		Router::add_rewrite_rules();
      		flush_rewrite_rules();
    }
  );

register_deactivation_hook(
  	__FILE__,
  	function () {
      		flush_rewrite_rules();
    }
  );
