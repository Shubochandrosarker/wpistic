<?php
/**
 * Minimal stand-in for WordPress's WP_REST_Request class, sufficient for
 * unit tests that only need headers and params.
 *
 * @package WPistic\Core
 */

if ( ! class_exists( 'WP_REST_Request' ) ) {
	class WP_REST_Request {

		/**
		 * @var array<string,mixed>
		 */
		private array $headers = array();

		/**
		 * @var array<string,mixed>
		 */
		private array $params = array();

		private string $method;
		private string $route;

		public function __construct( $method = '', $route = '' ) {
			$this->method = $method;
			$this->route  = $route;
		}

		public function get_method(): string {
			return $this->method;
		}

		public function get_route(): string {
			return $this->route;
		}

		/**
		 * @param string $key   Header name (case- and separator-insensitive).
		 * @param mixed  $value Header value.
		 */
		public function set_header( string $key, $value ): void {
			$this->headers[ $this->header_key( $key ) ] = $value;
		}

		/**
		 * @param string $key Header name.
		 * @return mixed
		 */
		public function get_header( string $key ) {
			return $this->headers[ $this->header_key( $key ) ] ?? null;
		}

		/**
		 * @param string $key   Param name.
		 * @param mixed  $value Param value.
		 */
		public function set_param( string $key, $value ): void {
			$this->params[ $key ] = $value;
		}

		/**
		 * @param string $key Param name.
		 * @return mixed
		 */
		public function get_param( string $key ) {
			return $this->params[ $key ] ?? null;
		}

		/**
		 * @return array<string,mixed>
		 */
		public function get_params(): array {
			return $this->params;
		}

		private function header_key( string $key ): string {
			return strtolower( str_replace( '-', '_', $key ) );
		}
	}
}
