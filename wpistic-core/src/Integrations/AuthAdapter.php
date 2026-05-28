<?php
/**
 * WPistic Auth Flow adapter — login, register, JWT refresh, logout.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Integrations;

defined( 'ABSPATH' ) || exit;

/**
 * Talks to the WPistic Auth Flow plugin.
 *
 * The Auth Flow plugin owns the wpistic-auth/v1 namespace when active.
 * This adapter only reports availability and exposes helper metadata so
 * the dashboard knows whether JWT auth is in play; the core never
 * re-implements token issuance when the dedicated plugin is present.
 */
class AuthAdapter extends AbstractAdapter {

	public function slug(): string {
		return 'auth';
	}

	public function is_available(): bool {
		return function_exists( 'wpistic_auth' )
			|| class_exists( '\\WPistic\\Auth\\Plugin' )
			|| defined( 'WPISTIC_AUTH_VERSION' );
	}

	/**
	 * Whether JWT issuance is handled by the Auth Flow plugin.
	 */
	public function supports_jwt(): bool {
		return $this->is_available() && (bool) apply_filters( 'wpistic_auth/supports_jwt', true );
	}
}
