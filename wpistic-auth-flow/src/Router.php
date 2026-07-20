<?php
/**
 * Rewrite rules + template loading for /login, /register, and /wpistic-logout.
 *
 * Mirrors wpistic-dashboard's Router: plain PHP templates, no build step.
 *
 * @package WPistic\Auth
 */

namespace WPistic\Auth;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the standalone auth routes.
   */
class Router {

	public const LOGIN_VAR    = 'wpistic_auth_login';
  	public const REGISTER_VAR = 'wpistic_auth_register';
  	public const LOGOUT_VAR   = 'wpistic_auth_logout';

	/**
	 * Wire up rewrite + routing hooks.
  	 */
	public function register(): void {
    		add_action( 'init', array( self::class, 'add_rewrite_rules' ) );
    		add_filter( 'query_vars', array( $this, 'register_query_vars' ) );
    		add_action( 'template_redirect', array( $this, 'handle_logout' ) );
    		add_action( 'template_redirect', array( $this, 'guard_auth_pages' ) );
    		add_filter( 'template_include', array( $this, 'load_template' ) );
  }

	/**
	 * Register the rewrite rules. Static so activation can call it too.
  	 */
	public static function add_rewrite_rules(): void {
    		add_rewrite_rule( '^login/?$', 'index.php?' . self::LOGIN_VAR . '=1', 'top' );
    		add_rewrite_rule( '^register/?$', 'index.php?' . self::REGISTER_VAR . '=1', 'top' );
    		add_rewrite_rule( '^wpistic-logout/?$', 'index.php?' . self::LOGOUT_VAR . '=1', 'top' );
  }

	/**
	 * Whitelist the query vars.
  	 *
  	 * @param string[] $vars Existing query vars.
  	 * @return string[]
  	 */
	public function register_query_vars( array $vars ): array {
    		$vars[] = self::LOGIN_VAR;
    		$vars[] = self::REGISTER_VAR;
    		$vars[] = self::LOGOUT_VAR;
    		return $vars;
  }

	/**
	 * Whether the current request is for the login page.
  	 */
	public static function is_login_request(): bool {
    		return (bool) get_query_var( self::LOGIN_VAR );
  }

	/**
	 * Whether the current request is for the register page.
  	 */
	public static function is_register_request(): bool {
    		return (bool) get_query_var( self::REGISTER_VAR );
  }

	/**
	 * Whether the current request is the logout endpoint.
  	 */
	public static function is_logout_request(): bool {
    		return (bool) get_query_var( self::LOGOUT_VAR );
  }

	/**
	 * Log the user out and send them back to /login, without ever touching
  	 * wp-login.php.
  	 */
	public function handle_logout(): void {
    		if ( ! self::is_logout_request() ) {
          			return;
        }
    		wp_logout();
    		wp_safe_redirect( home_url( '/login/' ) );
    		exit;
  }

	/**
	 * Bounce already-authenticated visitors away from /login and /register.
  	 */
	public function guard_auth_pages(): void {
    		if ( ( self::is_login_request() || self::is_register_request() ) && is_user_logged_in() ) {
          			wp_safe_redirect( home_url( '/dashboard' ) );
          			exit;
        }
  }

	/**
	 * Swap in the standalone templates for our auth requests.
  	 *
  	 * @param string $template Resolved template path.
  	 * @return string
  	 */
	public function load_template( string $template ): string {
    		if ( self::is_login_request() ) {
          			$custom = WPISTIC_AUTH_PATH . 'templates/login.php';
          			return is_readable( $custom ) ? $custom : $template;
        }
    		if ( self::is_register_request() ) {
          			$custom = WPISTIC_AUTH_PATH . 'templates/register.php';
          			return is_readable( $custom ) ? $custom : $template;
        }
    		return $template;
  }
}
