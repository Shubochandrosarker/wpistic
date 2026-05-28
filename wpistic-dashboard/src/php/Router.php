<?php
/**
 * Dashboard routing — rewrite /dashboard and child routes to one template.
 *
 * @package WPistic\Dashboard
 */

namespace WPistic\Dashboard;

defined( 'ABSPATH' ) || exit;

/**
 * Registers a single SPA mount point. Every /dashboard/* child route is
 * rewritten back to the same template so React Router can take over.
 */
class Router {

	/**
	 * Query var flagging a dashboard request.
	 */
	public const QUERY_VAR = 'wpistic_dashboard';

	/**
	 * Wire up rewrite + routing hooks.
	 */
	public function register(): void {
		add_action( 'init', array( self::class, 'add_rewrite_rules' ) );
		add_filter( 'query_vars', array( $this, 'register_query_var' ) );
		add_action( 'template_redirect', array( $this, 'guard_access' ) );
		add_filter( 'template_include', array( $this, 'load_template' ) );
		add_filter( 'redirect_canonical', array( $this, 'disable_canonical_for_dashboard' ), 10, 2 );
	}

	/**
	 * Register the rewrite rules. Static so activation can call it too.
	 */
	public static function add_rewrite_rules(): void {
		// /dashboard and any nested child route map to the same flag.
		add_rewrite_rule( '^dashboard/?$', 'index.php?' . self::QUERY_VAR . '=1', 'top' );
		add_rewrite_rule( '^dashboard/(.+)/?$', 'index.php?' . self::QUERY_VAR . '=1', 'top' );
	}

	/**
	 * Whitelist the query var.
	 *
	 * @param string[] $vars Existing query vars.
	 * @return string[]
	 */
	public function register_query_var( array $vars ): array {
		$vars[] = self::QUERY_VAR;
		return $vars;
	}

	/**
	 * Whether the current request is a dashboard request.
	 */
	public static function is_dashboard_request(): bool {
		return (bool) get_query_var( self::QUERY_VAR );
	}

	/**
	 * Require login + capability; redirect guests to the login flow.
	 */
	public function guard_access(): void {
		if ( ! self::is_dashboard_request() ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			$login = apply_filters( 'wpistic/dashboard/login_url', wp_login_url( home_url( '/dashboard/' ) ) );
			wp_safe_redirect( $login );
			exit;
		}
		if ( ! current_user_can( 'wpistic_access_dashboard' ) ) {
			// Logged in but no access — let the SPA render an upgrade/empty state,
			// rather than a hard wall, so we still load the template.
			do_action( 'wpistic/dashboard/access_denied', get_current_user_id() );
		}
	}

	/**
	 * Swap in the SPA mount template for dashboard requests.
	 *
	 * @param string $template Resolved template path.
	 * @return string
	 */
	public function load_template( string $template ): string {
		if ( ! self::is_dashboard_request() ) {
			return $template;
		}
		$custom = WPISTIC_DASH_PATH . 'templates/dashboard.php';
		return is_readable( $custom ) ? $custom : $template;
	}

	/**
	 * Stop WordPress from redirecting dashboard child URLs (e.g. trailing-slash
	 * canonicalization that would break deep links).
	 *
	 * @param string $redirect_url  Proposed redirect.
	 * @param string $requested_url Requested URL.
	 * @return string|false
	 */
	public function disable_canonical_for_dashboard( $redirect_url, $requested_url ) {
		unset( $requested_url );
		return self::is_dashboard_request() ? false : $redirect_url;
	}
}
