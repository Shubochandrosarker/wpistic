<?php
/**
 * /wpistic/v1/workspace controller.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WPistic\Core\Services\WorkspaceService;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * Read + create the current user's workspace.
 */
class WorkspaceController extends AbstractController {

	/**
	 * Register routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/workspace',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'get_workspace' ),
					'permission_callback' => array( $this, 'require_dashboard_access' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'create_workspace' ),
					'permission_callback' => $this->require_capability( 'wpistic_manage_workspace' ),
					'args'                => array(
						'name' => array(
							'required'          => true,
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						),
						'plan' => array(
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_key',
						),
					),
				),
			)
		);
	}

	/**
	 * GET /workspace.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function get_workspace( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		$workspace = $this->current_workspace();
		if ( is_wp_error( $workspace ) ) {
			return new WP_REST_Response( array( 'workspace' => null ), 200 );
		}
		return new WP_REST_Response( array( 'workspace' => $workspace ), 200 );
	}

	/**
	 * POST /workspace.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function create_workspace( WP_REST_Request $request ): WP_REST_Response {
		/** @var WorkspaceService $service */
		$service   = $this->service( WorkspaceService::class );
		$workspace = $service->create(
			get_current_user_id(),
			(string) $request->get_param( 'name' ),
			array( 'plan_slug' => (string) $request->get_param( 'plan' ) ?: 'free' )
		);
		return new WP_REST_Response( array( 'workspace' => $workspace ), 201 );
	}
}
