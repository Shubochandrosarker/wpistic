<?php
/**
 * /wpistic/v1/api-keys controller (Developers area).
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WPistic\Core\Services\ApiKeyService;
use WPistic\Core\Services\ActivityService;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * List, create, regenerate, and revoke developer API keys. Raw keys are
 * only ever returned once at creation/regeneration time.
 */
class DevelopersController extends AbstractController {

	/**
	 * Register routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/api-keys',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'index' ),
					'permission_callback' => $this->require_capability( 'wpistic_manage_api_keys' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'create' ),
					'permission_callback' => $this->require_capability( 'wpistic_manage_api_keys' ),
					'args'                => array(
						'label' => array(
							'required'          => true,
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/api-keys/(?P<id>\d+)',
			array(
				'methods'             => 'DELETE',
				'callback'            => array( $this, 'revoke' ),
				'permission_callback' => $this->require_capability( 'wpistic_manage_api_keys' ),
				'args'                => array(
					'id' => array(
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/api-keys/(?P<id>\d+)/regenerate',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'regenerate' ),
				'permission_callback' => $this->require_capability( 'wpistic_manage_api_keys' ),
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
	 * GET /api-keys.
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
		/** @var ApiKeyService $service */
		$service = $this->service( ApiKeyService::class );
		return new WP_REST_Response( array( 'keys' => $service->list_for_workspace( $workspace['id'] ) ), 200 );
	}

	/**
	 * POST /api-keys.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create( WP_REST_Request $request ) {
		$workspace = $this->current_workspace();
		if ( is_wp_error( $workspace ) ) {
			return $workspace;
		}
		$rl = $this->rate_limit( 'api_key_create', 10, MINUTE_IN_SECONDS );
		if ( is_wp_error( $rl ) ) {
			return $rl;
		}
		/** @var ApiKeyService $service */
		$service = $this->service( ApiKeyService::class );
		$key     = $service->create( $workspace['id'], get_current_user_id(), (string) $request->get_param( 'label' ) );

		$this->log( $workspace['id'], 'api_key_created', sprintf( 'Created API key %s', $key['prefix'] ) );

		// `plain` is included once here only.
		return new WP_REST_Response( array( 'key' => $key ), 201 );
	}

	/**
	 * DELETE /api-keys/{id}.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function revoke( WP_REST_Request $request ) {
		$workspace = $this->current_workspace();
		if ( is_wp_error( $workspace ) ) {
			return $workspace;
		}
		/** @var ApiKeyService $service */
		$service = $this->service( ApiKeyService::class );
		$ok      = $service->revoke( (int) $request->get_param( 'id' ), $workspace['id'] );
		if ( ! $ok ) {
			return new WP_Error( 'wpistic_not_found', __( 'Key not found.', 'wpistic-core' ), array( 'status' => 404 ) );
		}
		return new WP_REST_Response( array( 'revoked' => true ), 200 );
	}

	/**
	 * POST /api-keys/{id}/regenerate.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function regenerate( WP_REST_Request $request ) {
		$workspace = $this->current_workspace();
		if ( is_wp_error( $workspace ) ) {
			return $workspace;
		}
		/** @var ApiKeyService $service */
		$service = $this->service( ApiKeyService::class );
		$key     = $service->regenerate( (int) $request->get_param( 'id' ), $workspace['id'], get_current_user_id() );
		if ( null === $key ) {
			return new WP_Error( 'wpistic_not_found', __( 'Key not found.', 'wpistic-core' ), array( 'status' => 404 ) );
		}
		$this->log( $workspace['id'], 'api_key_regenerated', sprintf( 'Regenerated API key %s', $key['prefix'] ) );
		return new WP_REST_Response( array( 'key' => $key ), 200 );
	}

	/**
	 * Record an activity entry.
	 *
	 * @param int    $workspace_id Workspace id.
	 * @param string $event        Event type.
	 * @param string $message      Message.
	 */
	private function log( int $workspace_id, string $event, string $message ): void {
		/** @var ActivityService $activity */
		$activity = $this->service( ActivityService::class );
		$activity->record(
			$workspace_id,
			$event,
			array(
				'user_id' => get_current_user_id(),
				'message' => $message,
			)
		);
	}
}
