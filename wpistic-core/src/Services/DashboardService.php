<?php
/**
 * Dashboard aggregation service.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Services;

use WPistic\Core\Integrations\IntegrationRegistry;

defined( 'ABSPATH' ) || exit;

/**
 * Assembles the dashboard "overview" payload from every domain service
 * and integration, so the React app has one fast endpoint to boot from.
 */
class DashboardService {

	private WorkspaceService $workspaces;
	private WebsiteService $websites;
	private ActivityService $activity;
	private IntegrationRegistry $integrations;

	/**
	 * Constructor.
	 *
	 * @param WorkspaceService    $workspaces   Workspace service.
	 * @param WebsiteService      $websites     Website service.
	 * @param ActivityService     $activity     Activity service.
	 * @param IntegrationRegistry $integrations Integration registry.
	 */
	public function __construct(
		WorkspaceService $workspaces,
		WebsiteService $websites,
		ActivityService $activity,
		IntegrationRegistry $integrations
	) {
		$this->workspaces   = $workspaces;
		$this->websites     = $websites;
		$this->activity     = $activity;
		$this->integrations = $integrations;
	}

	/**
	 * Build the dashboard overview payload for a user.
	 *
	 * @param int $user_id WordPress user id.
	 * @return array<string,mixed>
	 */
	public function overview( int $user_id ): array {
		$workspace = $this->workspaces->get_for_user( $user_id );
		if ( ! $workspace ) {
			return array(
				'workspace' => null,
				'empty'     => true,
			);
		}

		$licenses = $this->integrations->licenseistic()->get_licenses( $user_id );
		$websites = $this->websites->list_for_workspace( $workspace['id'] );
		$sub      = $this->integrations->memberistic()->get_subscription( $user_id );

		$stats = array(
			'licenses'      => count( $licenses ),
			'websites'      => count( $websites ),
			'licenses_attn' => count(
				array_filter(
					$licenses,
					static fn( $l ) => in_array( $l['status'] ?? '', array( 'expiring', 'expired', 'suspended' ), true )
				)
			),
		);

		return array(
			'workspace'    => $workspace,
			'subscription' => $sub,
			'stats'        => $stats,
			'websites'     => $websites,
			'activity'     => $this->activity->recent( $workspace['id'], 10 ),
			'modules'      => $this->integrations->availability(),
			'empty'        => false,
		);
	}
}
