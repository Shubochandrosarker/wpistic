<?php
/**
 * Licenseistic adapter — licenses, activations, downloads, entitlements.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Integrations;

defined( 'ABSPATH' ) || exit;

/**
 * Talks to the Licenseistic plugin through a stable contract.
 *
 * Licenseistic is expected to expose (when active):
 *   - defined( 'LICENSEISTIC_VERSION' ) / class \Licenseistic\Plugin
 *   - filter  licenseistic/api/licenses        ( $default, int $user_id )
 *   - filter  licenseistic/api/downloads       ( $default, int $user_id )
 *   - action  licenseistic/license/activate    ( array $args )
 *   - action  licenseistic/license/deactivate  ( array $args )
 *   - filter  licenseistic/license/validate    ( $default, array $args )
 *   - action  licenseistic/entitlement/grant   ( array $args )   ← used by the bridge
 *   - action  licenseistic/entitlement/revoke  ( array $args )
 */
class LicenseisticAdapter extends AbstractAdapter {

	public function slug(): string {
		return 'licenseistic';
	}

	public function is_available(): bool {
		return function_exists( 'licenseistic' )
			|| class_exists( '\\Licenseistic\\Plugin' )
			|| defined( 'LICENSEISTIC_VERSION' );
	}

	/**
	 * Licenses owned by a user.
	 *
	 * @param int $user_id WordPress user id.
	 * @return array<int,array<string,mixed>>
	 */
	public function get_licenses( int $user_id ): array {
		return (array) $this->filtered( 'licenseistic/api/licenses', array(), $user_id );
	}

	/**
	 * Available downloads / builds for a user's entitlements.
	 *
	 * @param int $user_id WordPress user id.
	 * @return array<int,array<string,mixed>>
	 */
	public function get_downloads( int $user_id ): array {
		return (array) $this->filtered( 'licenseistic/api/downloads', array(), $user_id );
	}

	/**
	 * Activate a license on a domain.
	 *
	 * @param array<string,mixed> $args license_key, domain, user_id.
	 * @return array{success:bool,message:string,data:array}
	 */
	public function activate( array $args ): array {
		if ( ! $this->is_available() ) {
			return $this->unavailable();
		}
		/** This action lets Licenseistic perform the activation. */
		do_action( 'licenseistic/license/activate', $args );
		return (array) apply_filters(
			'licenseistic/license/activate_result',
			array(
				'success' => true,
				'message' => __( 'License activated.', 'wpistic-core' ),
				'data'    => array(),
			),
			$args
		);
	}

	/**
	 * Deactivate a license on a domain.
	 *
	 * @param array<string,mixed> $args license_key, domain, user_id.
	 * @return array{success:bool,message:string,data:array}
	 */
	public function deactivate( array $args ): array {
		if ( ! $this->is_available() ) {
			return $this->unavailable();
		}
		do_action( 'licenseistic/license/deactivate', $args );
		return (array) apply_filters(
			'licenseistic/license/deactivate_result',
			array(
				'success' => true,
				'message' => __( 'License deactivated.', 'wpistic-core' ),
				'data'    => array(),
			),
			$args
		);
	}

	/**
	 * Validate a license key for a domain.
	 *
	 * @param array<string,mixed> $args license_key, domain.
	 * @return array{valid:bool,status:string,message:string}
	 */
	public function validate( array $args ): array {
		$default = array(
			'valid'   => false,
			'status'  => 'unknown',
			'message' => __( 'License service unavailable.', 'wpistic-core' ),
		);
		return (array) $this->filtered( 'licenseistic/license/validate', $default, $args );
	}

	/**
	 * Grant entitlements for a product (used by the Memberistic bridge).
	 *
	 * @param array<string,mixed> $args user_id, product, plan, limits.
	 */
	public function grant_entitlement( array $args ): void {
		if ( $this->is_available() ) {
			do_action( 'licenseistic/entitlement/grant', $args );
		}
	}

	/**
	 * Revoke / suspend entitlements (used by the Memberistic bridge).
	 *
	 * @param array<string,mixed> $args user_id, product, reason.
	 */
	public function revoke_entitlement( array $args ): void {
		if ( $this->is_available() ) {
			do_action( 'licenseistic/entitlement/revoke', $args );
		}
	}

	/**
	 * Update entitlement limits on plan change.
	 *
	 * @param array<string,mixed> $args user_id, limits.
	 */
	public function update_limits( array $args ): void {
		if ( $this->is_available() ) {
			do_action( 'licenseistic/entitlement/update_limits', $args );
		}
	}

	/**
	 * Standard unavailable response.
	 *
	 * @return array{success:bool,message:string,data:array}
	 */
	private function unavailable(): array {
		return array(
			'success' => false,
			'message' => __( 'Licenseistic is not installed.', 'wpistic-core' ),
			'data'    => array(),
		);
	}
}
