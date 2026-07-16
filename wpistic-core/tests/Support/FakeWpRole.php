<?php
/**
 * Minimal stand-in for WordPress's WP_Role class.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Support;

final class FakeWpRole {

	/**
	 * @var array<string,bool>
	 */
	public array $capabilities;

	/**
	 * @var array<int,string>
	 */
	public array $added_caps = array();

	/**
	 * @param array<string,bool> $capabilities Initial capability grants.
	 */
	public function __construct( array $capabilities = array() ) {
		$this->capabilities = $capabilities;
	}

	public function has_cap( string $cap ): bool {
		return ! empty( $this->capabilities[ $cap ] );
	}

	public function add_cap( string $cap ): void {
		$this->capabilities[ $cap ] = true;
		$this->added_caps[]         = $cap;
	}
}
