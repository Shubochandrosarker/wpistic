<?php
/**
 * Plugin bootstrap — wires the router, REST controller, and dashboard filters.
 *
 * @package WPistic\Auth
 */

namespace WPistic\Auth;

defined( 'ABSPATH' ) || exit;

use WPistic\Auth\REST\AuthController;

/**
 * Main plugin container.
   */
class Plugin {

	/**
	 * Boot all collaborators and register hooks.
  	 */
	public function __construct() {
    		( new Router() )->register();
    		( new AuthController() )->register();

  		add_filter( 'wpistic/dashboard/login_url', array( $this, 'login_url' ) );
    		add_filter( 'wpistic/dashboard/boot', array( $this, 'filter_boot' ), 10, 2 );
    		add_filter( 'wpistic_auth/supports_jwt', '__return_false' );
  }

	/**
	 * Point the dashboard's "please log in" redirect at our own /login page
  	 * instead of wp-login.php.
  	 *
  	 * @param string $default_url Default WordPress login URL.
  	 */
	public function login_url( $default_url ): string {
    		unset( $default_url );
    		return home_url( '/login/' );
  }

	/**
	 * Replace the boot payload's logout URL so the SPA never links to
  	 * wp-login.php?action=logout.
  	 *
  	 * @param array<string,mixed> $payload Boot payload.
  	 * @param int                 $user_id Current user id.
  	 * @return array<string,mixed>
  	 */
	public function filter_boot( array $payload, int $user_id ): array {
    		unset( $user_id );
    		$payload['logoutUrl'] = home_url( '/wpistic-logout/' );
    		return $payload;
  }
}
