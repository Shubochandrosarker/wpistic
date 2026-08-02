<?php
/**
 * Typed access to the entitlement map from the last valid license response.
 * Product code never checks plan names:
 *
 *     if ( $license->entitlements()->allows( 'seoistic.pro.enabled' ) ) { ... }
 *     $max_sites = $license->entitlements()->limit( 'seoistic.sites.max' );
 */

namespace WPistic\Sdk;

class Entitlements {

	/** @var array<string,mixed> */
	private $map;

	/**
	 * @param array<string,mixed> $map
	 */
	public function __construct( array $map = array() ) {
		$this->map = $map;
	}

	public function allows( string $key ): bool {
		return isset( $this->map[ $key ] ) && true === $this->map[ $key ];
	}

	public function limit( string $key ): int {
		if ( isset( $this->map[ $key ] ) && is_numeric( $this->map[ $key ] ) ) {
			return (int) $this->map[ $key ];
		}
		return 0;
	}

	/**
	 * @param string $key
	 * @param mixed  $default
	 * @return mixed
	 */
	public function value( string $key, $default = null ) {
		return isset( $this->map[ $key ] ) ? $this->map[ $key ] : $default;
	}

	/**
	 * @return array<string,mixed>
	 */
	public function all(): array {
		return $this->map;
	}
}
