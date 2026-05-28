<?php
/**
 * Builds the localized WPistic boot object for the React app.
 *
 * @package WPistic\Dashboard
 */

namespace WPistic\Dashboard;

defined( 'ABSPATH' ) || exit;

/**
 * Assembles restUrl, nonce, currentUser, workspace, plan, enabledModules,
 * and asset URLs — the single object the SPA hydrates from.
 */
class BootData {

	/**
	 * Build the boot payload.
	 *
	 * @return array<string,mixed>
	 */
	public function build(): array {
		$user_id = get_current_user_id();
		$user    = wp_get_current_user();

		$workspace = null;
		$plan      = array(
			'slug'   => 'free',
			'name'   => 'Free',
			'status' => 'active',
		);
		$modules = array();

		// Pull richer data from WPistic Core when present.
		if ( class_exists( '\\WPistic\\Core\\Plugin' ) ) {
			try {
				$core         = \WPistic\Core\Plugin::instance();
				$registry     = $core->service( \WPistic\Core\Integrations\IntegrationRegistry::class );
				$workspaces   = $core->service( \WPistic\Core\Services\WorkspaceService::class );
				$workspace    = $workspaces->get_for_user( $user_id );
				$plan         = $registry->memberistic()->resolve_plan( $user_id );
				$modules      = $registry->availability();
			} catch ( \Throwable $e ) {
				unset( $e );
			}
		}

		$payload = array(
			'restUrl'        => esc_url_raw( rest_url() ),
			'restNamespaces' => array(
				'wpistic'      => 'wpistic/v1',
				'memberistic'  => 'memberistic/v1',
				'licenseistic' => 'licenseistic/v1',
				'auth'         => 'wpistic-auth/v1',
			),
			'nonce'          => wp_create_nonce( 'wp_rest' ),
			'logoutUrl'      => esc_url_raw( wp_logout_url( home_url( '/' ) ) ),
			'homeUrl'        => esc_url_raw( home_url( '/' ) ),
			'basePath'       => '/dashboard',
			'currentUser'    => array(
				'id'       => $user_id,
				'name'     => $user->display_name,
				'email'    => $user->user_email,
				'avatar'   => get_avatar_url( $user_id, array( 'size' => 96 ) ),
				'initials' => strtoupper( substr( $user->display_name ?: 'U', 0, 2 ) ),
				'roles'    => array_values( $user->roles ),
				'caps'     => array(
					'manage_workspace' => current_user_can( 'wpistic_manage_workspace' ),
					'manage_licenses'  => current_user_can( 'wpistic_manage_licenses' ),
					'manage_websites'  => current_user_can( 'wpistic_manage_websites' ),
					'manage_billing'   => current_user_can( 'wpistic_manage_billing' ),
					'manage_api_keys'  => current_user_can( 'wpistic_manage_api_keys' ),
				),
			),
			'workspace'      => $workspace,
			'plan'           => $plan,
			'enabledModules' => $modules,
			'assets'         => array(
				'logoPurple' => WPISTIC_DASH_URL . 'assets/logo-purple.png',
				'logoGreen'  => WPISTIC_DASH_URL . 'assets/logo-green.png',
				'logoWhite'  => WPISTIC_DASH_URL . 'assets/logo-white.png',
			),
		);

		/**
		 * Filter the dashboard boot object before it is localized.
		 *
		 * @param array<string,mixed> $payload Boot payload.
		 * @param int                 $user_id Current user id.
		 */
		return apply_filters( 'wpistic/dashboard/boot', $payload, $user_id );
	}
}
