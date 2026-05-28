<?php
/**
 * /wpistic/v1/activity controller.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WPistic\Core\Services\ActivityService;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Read the workspace activity feed.
 */
class ActivityController extends AbstractController {

	/**
	 * Register routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/activity',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'index' ),
				'permission_callback' => array( $this, 'require_dashboard_access' ),
				'args'                => array(
					'limit' => array(
						'type'              => 'integer',
						'default'           => 25,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}

	/**
	 * GET /activity.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function index( WP_REST_Request $request ) {
		$workspace = $this->current_workspace();
		if ( is_wp_error( $workspace ) ) {
			return $workspace;
		}
		/** @var ActivityService $service */
		$service = $this->service( ActivityService::class );
		return new WP_REST_Response(
			array( 'activity' => $service->recent( $workspace['id'], (int) $request->get_param( 'limit' ) ) ),
			200
		);
	}
}
