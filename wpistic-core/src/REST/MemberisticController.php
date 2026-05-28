<?php
/**
 * Guarded fallback controller for the memberistic/v1 namespace.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WPistic\Core\Integrations\IntegrationRegistry;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * Exposes memberistic/v1 endpoints ONLY for routes the Memberistic plugin
 * has not already registered. This guarantees the dashboard always has a
 * contract to call, without clobbering the real plugin.
 */
class MemberisticController extends AbstractController {

	/**
	 * REST namespace owned by Memberistic.
	 */
	protected string $namespace = 'memberistic/v1';

	/**
	 * Register guarded routes.
	 */
	public function register_routes(): void {
		$routes = array(
			'/plans'        => array( $this, 'plans' ),
			'/subscription' => array( $this, 'subscription' ),
			'/billing'      => array( $this, 'billing' ),
			'/invoices'     => array( $this, 'invoices' ),
		);

		foreach ( $routes as $route => $callback ) {
			if ( $this->route_exists( $this->namespace, $route ) ) {
				continue; // The real plugin owns it.
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
	}

	/**
	 * Resolve the Memberistic adapter.
	 */
	private function adapter() {
		/** @var IntegrationRegistry $reg */
		$reg = $this->service( IntegrationRegistry::class );
		return $reg->memberistic();
	}

	/**
	 * GET /plans.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function plans( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		return new WP_REST_Response( array( 'plans' => $this->adapter()->get_plans() ), 200 );
	}

	/**
	 * GET /subscription.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function subscription( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		return new WP_REST_Response(
			array( 'subscription' => $this->adapter()->get_subscription( get_current_user_id() ) ),
			200
		);
	}

	/**
	 * GET /billing.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function billing( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		return new WP_REST_Response(
			array( 'billing' => $this->adapter()->get_billing( get_current_user_id() ) ),
			200
		);
	}

	/**
	 * GET /invoices.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function invoices( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		return new WP_REST_Response(
			array( 'invoices' => $this->adapter()->get_invoices( get_current_user_id() ) ),
			200
		);
	}
}
