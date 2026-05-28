<?php
/**
 * Base class for integration adapters.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Integrations;

defined( 'ABSPATH' ) || exit;

/**
 * Adapters expose a stable contract over a sibling plugin and degrade
 * gracefully (returning fallbacks) when that plugin is not installed.
 */
abstract class AbstractAdapter {

	/**
	 * Whether the underlying plugin is active and usable.
	 */
	abstract public function is_available(): bool;

	/**
	 * Slug identifying this integration.
	 */
	abstract public function slug(): string;

	/**
	 * Apply a plugin-provided filter when available, else return a default.
	 *
	 * @param string $hook    Filter hook the sibling plugin is expected to provide.
	 * @param mixed  $default Default value when the plugin is absent.
	 * @param mixed  ...$args Additional filter arguments.
	 * @return mixed
	 */
	protected function filtered( string $hook, $default, ...$args ) {
		if ( ! $this->is_available() ) {
			return $default;
		}
		return apply_filters( $hook, $default, ...$args );
	}
}
