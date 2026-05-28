<?php
/**
 * Guarded fallback controller for the wpistic-auth/v1 namespace.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WPistic\Core\Integrations\IntegrationRegistry;
use WPistic\Core\Support\RateLimiter;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * The WPistic Auth Flow plugin owns wpistic-auth/v1 when installed. This
 * fallback only registers a small status endpoint so the dashboard can
 * detect auth capabilities; it never re-implements token issuance when the
 * real plugin is present.
 */
class AuthController extends AbstractController {

	/**
	 * REST namespace owned by WPistic Auth Flow.
	 */
	protected string $namespace = 'wpistic-auth/v1';

	/**
	 * Register guarded routes.
	 */
	public function register_routes(): void {
		// Always-safe capability probe.
		if ( ! $this->route_exists( $this->namespace, '/status' ) ) {
			register_rest_route(
				$this->namespace,
				'/status',
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'status' ),
					'permission_callback' => '__return_true',
				)
			);
		}

		// Logout fallback (cookie session) when the auth plugin is absent.
		if ( ! $this->adapter()->is_available() && ! $this->route_exists( $this->namespace, '/logout' ) ) {
			register_rest_route(
				$this->namespace,
				'/logout',
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'logout' ),
					'permission_callback' => 'is_user_logged_in',
				)
			);
		}
	}

	/**
	 * Resolve the Auth adapter.
	 */
	private function adapter() {
		/** @var IntegrationRegistry $reg */
		$reg = $this->service( IntegrationRegistry::class );
		return $reg->auth();
	}

	/**
	 * GET /status — capability probe (rate limited, public).
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function status( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		if ( ! RateLimiter::check( 'auth_status', RateLimiter::client_ip(), 60, MINUTE_IN_SECONDS ) ) {
			return new WP_REST_Response( array( 'message' => 'rate_limited' ), 429 );
		}
		return new WP_REST_Response(
			array(
				'auth_plugin'     => $this->adapter()->is_available(),
				'supports_jwt'    => $this->adapter()->supports_jwt(),
				'logged_in'       => is_user_logged_in(),
			),
			200
		);
	}

	/**
	 * POST /logout — fallback cookie logout.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function logout( WP_REST_Request $request ): WP_REST_Response {
		$nonce = $this->verify_nonce( $request );
		if ( is_wp_error( $nonce ) ) {
			return new WP_REST_Response( array( 'message' => $nonce->get_error_message() ), 403 );
		}
		wp_logout();
		return new WP_REST_Response( array( 'logged_out' => true ), 200 );
	}
}
