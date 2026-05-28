<?php
/**
 * Guarded fallback controller for the licenseistic/v1 namespace.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WPistic\Core\Integrations\IntegrationRegistry;
use WPistic\Core\Support\Security;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * Exposes licenseistic/v1 endpoints for routes the Licenseistic plugin has
 * not registered. Activation/validation are delegated to the adapter.
 */
class LicenseisticController extends AbstractController {

	/**
	 * REST namespace owned by Licenseistic.
	 */
	protected string $namespace = 'licenseistic/v1';

	/**
	 * Register guarded routes.
	 */
	public function register_routes(): void {
		$get_routes = array(
			'/licenses'  => array( $this, 'licenses' ),
			'/downloads' => array( $this, 'downloads' ),
		);
		foreach ( $get_routes as $route => $callback ) {
			if ( $this->route_exists( $this->namespace, $route ) ) {
				continue;
			}
			register_rest_route(
				$this->namespace,
				$route,
				array(
					'methods'             => 'GET',
					'callback'            => $callback,
					'permission_callback' => array( $this, 'require_dashboard_access' ),
				)
			);
		}

		$post_routes = array(
			'/activate'   => array( $this, 'activate' ),
			'/deactivate' => array( $this, 'deactivate' ),
			'/validate'   => array( $this, 'validate' ),
		);
		foreach ( $post_routes as $route => $callback ) {
			if ( $this->route_exists( $this->namespace, $route ) ) {
				continue;
			}
			register_rest_route(
				$this->namespace,
				$route,
				array(
					'methods'             => 'POST',
					'callback'            => $callback,
					'permission_callback' => $this->require_capability( 'wpistic_manage_licenses' ),
					'args'                => array(
						'license_key' => array(
							'required'          => true,
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						),
						'domain'      => array(
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						),
					),
				)
			);
		}
	}

	/**
	 * Resolve the Licenseistic adapter.
	 */
	private function adapter() {
		/** @var IntegrationRegistry $reg */
		$reg = $this->service( IntegrationRegistry::class );
		return $reg->licenseistic();
	}

	/**
	 * GET /licenses.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function licenses( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		return new WP_REST_Response(
			array( 'licenses' => $this->adapter()->get_licenses( get_current_user_id() ) ),
			200
		);
	}

	/**
	 * GET /downloads.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function downloads( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		return new WP_REST_Response(
			array( 'downloads' => $this->adapter()->get_downloads( get_current_user_id() ) ),
			200
		);
	}

	/**
	 * POST /activate.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function activate( WP_REST_Request $request ): WP_REST_Response {
		$rl = $this->rate_limit( 'license_activate', 20, MINUTE_IN_SECONDS );
		if ( is_wp_error( $rl ) ) {
			return new WP_REST_Response( array( 'message' => $rl->get_error_message() ), 429 );
		}
		return new WP_REST_Response( $this->adapter()->activate( $this->args( $request ) ), 200 );
	}

	/**
	 * POST /deactivate.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function deactivate( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( $this->adapter()->deactivate( $this->args( $request ) ), 200 );
	}

	/**
	 * POST /validate.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function validate( WP_REST_Request $request ): WP_REST_Response {
		$rl = $this->rate_limit( 'license_validate', 60, MINUTE_IN_SECONDS );
		if ( is_wp_error( $rl ) ) {
			return new WP_REST_Response( array( 'message' => $rl->get_error_message() ), 429 );
		}
		return new WP_REST_Response( $this->adapter()->validate( $this->args( $request ) ), 200 );
	}

	/**
	 * Normalize license action args.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return array<string,mixed>
	 */
	private function args( WP_REST_Request $request ): array {
		return array(
			'license_key' => (string) $request->get_param( 'license_key' ),
			'domain'      => Security::normalize_url( (string) $request->get_param( 'domain' ) ) ?? (string) $request->get_param( 'domain' ),
			'user_id'     => get_current_user_id(),
		);
	}
}
