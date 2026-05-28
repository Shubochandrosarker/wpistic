<?php
/**
 * /wpistic/v1/dashboard controller.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WPistic\Core\Services\DashboardService;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * Single aggregated overview endpoint for the dashboard home screen.
 */
class DashboardController extends AbstractController {

	/**
	 * Register routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/dashboard',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'get_overview' ),
				'permission_callback' => array( $this, 'require_dashboard_access' ),
			)
		);
	}

	/**
	 * GET /dashboard.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function get_overview( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		/** @var DashboardService $service */
		$service = $this->service( DashboardService::class );
		return new WP_REST_Response( $service->overview( get_current_user_id() ), 200 );
	}
}
