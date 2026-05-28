<?php
/**
 * Base REST controller with shared permission + security helpers.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WPistic\Core\Plugin;
use WPistic\Core\Support\ServiceContainer;
use WPistic\Core\Support\RateLimiter;
use WPistic\Core\Services\WorkspaceService;
use WP_Error;
use WP_REST_Request;

defined( 'ABSPATH' ) || exit;

/**
 * Every controller extends this and gets consistent auth, nonce, and
 * rate-limit handling so no endpoint ships without a permission_callback.
 */
abstract class AbstractController {

	/**
	 * REST namespace for first-party WPistic endpoints.
	 */
	protected string $namespace = 'wpistic/v1';

	/**
	 * Service container.
	 *
	 * @var ServiceContainer
	 */
	protected ServiceContainer $container;

	/**
	 * Constructor.
	 *
	 * @param ServiceContainer $container Service container.
	 */
	public function __construct( ServiceContainer $container ) {
		$this->container = $container;
	}

	/**
	 * Register routes for this controller.
	 */
	abstract public function register_routes(): void;

	/**
	 * Resolve a core service.
	 *
	 * @param string $id Service class id.
	 * @return mixed
	 */
	protected function service( string $id ) {
		return $this->container->get( $id );
	}

	// ── Permission callbacks ────────────────────────────────────

	/**
	 * Require a logged-in user with dashboard access capability.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return true|WP_Error
	 */
	public function require_dashboard_access( WP_REST_Request $request ) {
		if ( ! is_user_logged_in() ) {
			return $this->auth_error();
		}
		if ( ! current_user_can( 'wpistic_access_dashboard' ) ) {
			return new WP_Error(
				'wpistic_forbidden',
				__( 'You do not have access to the dashboard.', 'wpistic-core' ),
				array( 'status' => 403 )
			);
		}
		$nonce = $this->verify_nonce( $request );
		if ( is_wp_error( $nonce ) ) {
			return $nonce;
		}
		return true;
	}

	/**
	 * Require a specific capability (and dashboard access).
	 *
	 * @param string $capability Capability slug.
	 * @return callable
	 */
	protected function require_capability( string $capability ): callable {
		return function ( WP_REST_Request $request ) use ( $capability ) {
			$base = $this->require_dashboard_access( $request );
			if ( is_wp_error( $base ) ) {
				return $base;
			}
			if ( ! current_user_can( $capability ) ) {
				return new WP_Error(
					'wpistic_forbidden',
					__( 'Insufficient permissions.', 'wpistic-core' ),
					array( 'status' => 403 )
				);
			}
			return true;
		};
	}

	/**
	 * Verify the REST nonce for logged-in (cookie) requests.
	 *
	 * Requests authenticated by an application/JWT token (no cookie) are
	 * exempt — WordPress will already have rejected an invalid token.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return true|WP_Error
	 */
	protected function verify_nonce( WP_REST_Request $request ) {
		$nonce = $request->get_header( 'X-WP-Nonce' );
		// Cookie-auth without a valid nonce is the CSRF risk we guard against.
		if ( $nonce && wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return true;
		}
		// Allow non-cookie auth (token) requests to pass through.
		if ( ! isset( $_COOKIE[ LOGGED_IN_COOKIE ] ) ) {
			return true;
		}
		return new WP_Error(
			'wpistic_bad_nonce',
			__( 'Session expired. Please refresh and try again.', 'wpistic-core' ),
			array( 'status' => 403 )
		);
	}

	/**
	 * Enforce a rate limit for a bucket keyed to the current caller.
	 *
	 * @param string $bucket Bucket name.
	 * @param int    $limit  Hits allowed.
	 * @param int    $window Window seconds.
	 * @return true|WP_Error
	 */
	protected function rate_limit( string $bucket, int $limit, int $window ) {
		$key = is_user_logged_in() ? 'u' . get_current_user_id() : RateLimiter::client_ip();
		if ( ! RateLimiter::check( $bucket, $key, $limit, $window ) ) {
			return new WP_Error(
				'wpistic_rate_limited',
				__( 'Too many requests. Please slow down.', 'wpistic-core' ),
				array( 'status' => 429 )
			);
		}
		return true;
	}

	/**
	 * Resolve the active workspace for the current user, or an error.
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	protected function current_workspace() {
		/** @var WorkspaceService $service */
		$service   = $this->service( WorkspaceService::class );
		$workspace = $service->get_for_user( get_current_user_id() );
		if ( ! $workspace ) {
			return new WP_Error(
				'wpistic_no_workspace',
				__( 'No workspace found for this account.', 'wpistic-core' ),
				array( 'status' => 404 )
			);
		}
		return $workspace;
	}

	/**
	 * Standard 401.
	 */
	protected function auth_error(): WP_Error {
		return new WP_Error(
			'wpistic_unauthorized',
			__( 'Authentication required.', 'wpistic-core' ),
			array( 'status' => 401 )
		);
	}

	/**
	 * Whether a route is already registered (used to avoid clobbering a
	 * sibling plugin that owns the namespace).
	 *
	 * @param string $namespace REST namespace.
	 * @param string $route     Route path beginning with "/".
	 */
	protected function route_exists( string $namespace, string $route ): bool {
		$routes = rest_get_server()->get_routes( $namespace );
		return isset( $routes[ '/' . $namespace . $route ] );
	}
}
