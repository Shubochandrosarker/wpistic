<?php
/**
 * /wpistic/v1/websites controller.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WPistic\Core\Services\WebsiteService;
use WPistic\Core\Services\ActivityService;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * CRUD for connected websites.
 */
class WebsitesController extends AbstractController {

	/**
	 * Register routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/websites',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'index' ),
					'permission_callback' => array( $this, 'require_dashboard_access' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'connect' ),
					'permission_callback' => $this->require_capability( 'wpistic_manage_websites' ),
					'args'                => array(
						'url'  => array(
							'required'          => true,
							'type'              => 'string',
							'sanitize_callback' => 'esc_url_raw',
						),
						'name' => array(
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/websites/(?P<id>\d+)',
			array(
				'methods'             => 'DELETE',
				'callback'            => array( $this, 'disconnect' ),
				'permission_callback' => $this->require_capability( 'wpistic_manage_websites' ),
				'args'                => array(
					'id' => array(
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}

	/**
	 * GET /websites.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function index( WP_REST_Request $request ) {
		unset( $request );
		$workspace = $this->current_workspace();
		if ( is_wp_error( $workspace ) ) {
			return $workspace;
		}
		/** @var WebsiteService $service */
		$service = $this->service( WebsiteService::class );
		return new WP_REST_Response(
			array( 'websites' => $service->list_for_workspace( $workspace['id'] ) ),
			200
		);
	}

	/**
	 * POST /websites.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function connect( WP_REST_Request $request ) {
		$workspace = $this->current_workspace();
		if ( is_wp_error( $workspace ) ) {
			return $workspace;
		}
		$rate = $this->rate_limit( 'website_connect', 10, MINUTE_IN_SECONDS );
		if ( is_wp_error( $rate ) ) {
			return $rate;
		}

		/** @var WebsiteService $service */
		$service = $this->service( WebsiteService::class );
		$result  = $service->connect(
			$workspace['id'],
			(string) $request->get_param( 'url' ),
			(string) $request->get_param( 'name' )
		);

		if ( null === $result ) {
			return new WP_Error(
				'wpistic_invalid_url',
				__( 'Please provide a valid, reachable site URL.', 'wpistic-core' ),
				array( 'status' => 400 )
			);
		}

		/** @var ActivityService $activity */
		$activity = $this->service( ActivityService::class );
		$activity->record(
			$workspace['id'],
			'website_connected',
			array(
				'user_id'     => get_current_user_id(),
				'object_type' => 'website',
				'object_id'   => $result['website']['id'],
				'message'     => sprintf( 'Connected %s', $result['website']['url'] ),
			)
		);

		return new WP_REST_Response( $result, 201 );
	}

	/**
	 * DELETE /websites/{id}.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function disconnect( WP_REST_Request $request ) {
		$workspace = $this->current_workspace();
		if ( is_wp_error( $workspace ) ) {
			return $workspace;
		}
		/** @var WebsiteService $service */
		$service = $this->service( WebsiteService::class );
		$ok      = $service->disconnect( (int) $request->get_param( 'id' ), $workspace['id'] );
		if ( ! $ok ) {
			return new WP_Error(
				'wpistic_not_found',
				__( 'Website not found in this workspace.', 'wpistic-core' ),
				array( 'status' => 404 )
			);
		}
		return new WP_REST_Response( array( 'deleted' => true ), 200 );
	}
}
