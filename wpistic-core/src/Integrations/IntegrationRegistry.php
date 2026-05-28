<?php
/**
 * Integration registry — detects sibling plugins and exposes adapters.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Integrations;

defined( 'ABSPATH' ) || exit;

/**
 * Central place to ask "is Memberistic active?" and to fetch an adapter.
 *
 * Adapters wrap each sibling plugin so the rest of the codebase never
 * hard-couples to their internals — it talks to a stable contract and
 * gets safe fallbacks when a plugin is absent.
 */
class IntegrationRegistry {

	/**
	 * Adapter instances keyed by slug.
	 *
	 * @var array<string,AbstractAdapter>
	 */
	private array $adapters = array();

	/**
	 * Whether discovery has run.
	 *
	 * @var bool
	 */
	private bool $discovered = false;

	/**
	 * Instantiate adapters once plugins are loaded.
	 */
	public function discover(): void {
		if ( $this->discovered ) {
			return;
		}
		$this->discovered = true;

		$this->adapters = array(
			'memberistic'  => new MemberisticAdapter(),
			'licenseistic' => new LicenseisticAdapter(),
			'auth'         => new AuthAdapter(),
			'bookingistic' => new BookingisticAdapter(),
		);

		do_action( 'wpistic_integrations_discovered', $this );
	}

	/**
	 * Ensure adapters exist even if discover() has not yet run.
	 */
	private function ensure(): void {
		if ( ! $this->discovered ) {
			$this->discover();
		}
	}

	/**
	 * Fetch an adapter by slug.
	 *
	 * @param string $slug One of: memberistic, licenseistic, auth, bookingistic.
	 */
	public function get( string $slug ): ?AbstractAdapter {
		$this->ensure();
		return $this->adapters[ $slug ] ?? null;
	}

	public function memberistic(): MemberisticAdapter {
		$this->ensure();
		return $this->adapters['memberistic'];
	}

	public function licenseistic(): LicenseisticAdapter {
		$this->ensure();
		return $this->adapters['licenseistic'];
	}

	public function auth(): AuthAdapter {
		$this->ensure();
		return $this->adapters['auth'];
	}

	public function bookingistic(): BookingisticAdapter {
		$this->ensure();
		return $this->adapters['bookingistic'];
	}

	/**
	 * A map of which integrations are available — used to build enabledModules.
	 *
	 * @return array<string,bool>
	 */
	public function availability(): array {
		$this->ensure();
		$out = array();
		foreach ( $this->adapters as $slug => $adapter ) {
			$out[ $slug ] = $adapter->is_available();
		}
		return $out;
	}
}
