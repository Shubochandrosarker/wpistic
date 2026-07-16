<?php
/**
 * Minimal stand-in for WordPress's WP_REST_Response class.
 *
 * @package WPistic\Core
 */

if ( ! class_exists( 'WP_REST_Response' ) ) {
	class WP_REST_Response {

		private $data;

		private int $status;

		/**
		 * @var array<string,mixed>
		 */
		private array $headers;

		/**
		 * @param mixed                $data    Response data.
		 * @param int                  $status  HTTP status code.
		 * @param array<string,mixed>  $headers Response headers.
		 */
		public function __construct( $data = null, int $status = 200, array $headers = array() ) {
			$this->data    = $data;
			$this->status  = $status;
			$this->headers = $headers;
		}

		/**
		 * @return mixed
		 */
		public function get_data() {
			return $this->data;
		}

		/**
		 * @param mixed $data Response data.
		 */
		public function set_data( $data ): void {
			$this->data = $data;
		}

		public function get_status(): int {
			return $this->status;
		}

		public function set_status( int $status ): void {
			$this->status = $status;
		}

		/**
		 * @return array<string,mixed>
		 */
		public function get_headers(): array {
			return $this->headers;
		}
	}
}
