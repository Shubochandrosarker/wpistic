<?php
/**
 * Minimal dependency-injection container.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Support;

defined( 'ABSPATH' ) || exit;

/**
 * Tiny service container with lazy singleton resolution.
 */
class ServiceContainer {

	/**
	 * Factory closures keyed by service id.
	 *
	 * @var array<string,callable>
	 */
	private array $factories = array();

	/**
	 * Resolved singleton instances.
	 *
	 * @var array<string,mixed>
	 */
	private array $resolved = array();

	/**
	 * Register a lazily-resolved singleton.
	 *
	 * @param string   $id      Service identifier.
	 * @param callable $factory Factory receiving the container.
	 */
	public function singleton( string $id, callable $factory ): void {
		$this->factories[ $id ] = $factory;
	}

	/**
	 * Determine whether a service is registered.
	 *
	 * @param string $id Service identifier.
	 */
	public function has( string $id ): bool {
		return isset( $this->factories[ $id ] ) || isset( $this->resolved[ $id ] );
	}

	/**
	 * Resolve a service.
	 *
	 * @param string $id Service identifier.
	 * @return mixed
	 * @throws \RuntimeException When the service is unknown.
	 */
	public function get( string $id ) {
		if ( isset( $this->resolved[ $id ] ) ) {
			return $this->resolved[ $id ];
		}
		if ( ! isset( $this->factories[ $id ] ) ) {
			throw new \RuntimeException( esc_html( "WPistic: unknown service [{$id}]." ) );
		}
		$this->resolved[ $id ] = ( $this->factories[ $id ] )( $this );
		return $this->resolved[ $id ];
	}
}
