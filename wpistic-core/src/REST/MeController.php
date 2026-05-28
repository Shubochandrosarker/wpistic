<?php
/**
 * /wpistic/v1/me controller.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WPistic\Core\Services\WorkspaceService;
use WPistic\Core\Integrations\IntegrationRegistry;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * Returns the authenticated user, workspace, plan, and enabled modules —
 * the canonical "who am I" endpoint the dashboard boots from.
 */
class MeController extends AbstractController {

	/**
	 * Register routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/me',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'get_me' ),
				'permission_callback' => array( $this, 'require_dashboard_access' ),
			)
		);
	}

	/**
	 * Handle GET /me.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function get_me( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		$user_id = get_current_user_id();
		$user    = wp_get_current_user();

		/** @var WorkspaceService $workspaces */
		$workspaces = $this->service( WorkspaceService::class );
		/** @var IntegrationRegistry $integrations */
		$integrations = $this->service( IntegrationRegistry::class );

		$workspace = $workspaces->get_for_user( $user_id );
		$plan      = $integrations->memberistic()->resolve_plan( $user_id );

		return new WP_REST_Response(
			array(
				'user'      => array(
					'id'        => $user_id,
					'name'      => $user->display_name,
					'email'     => $user->user_email,
					'avatar'    => get_avatar_url( $user_id, array( 'size' => 96 ) ),
					'roles'     => array_values( $user->roles ),
					'initials'  => strtoupper( substr( $user->display_name, 0, 2 ) ),
				),
				'workspace' => $workspace,
				'plan'      => $plan,
				'modules'   => $integrations->availability(),
			),
			200
		);
	}
}
