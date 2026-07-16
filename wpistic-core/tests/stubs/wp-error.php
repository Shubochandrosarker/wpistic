<?php
/**
 * Minimal stand-in for WordPress's WP_Error class and is_wp_error(), so unit
 * tests can run without booting a full WordPress install.
 *
 * @package WPistic\Core
 */

if ( ! class_exists( 'WP_Error' ) ) {
	class WP_Error {

		/**
		 * @var array<string,array<int,string>>
		 */
		protected array $errors = array();

		/**
		 * @var array<string,mixed>
		 */
		protected array $error_data = array();

		/**
		 * @param string $code    Error code.
		 * @param string $message Error message.
		 * @param mixed  $data    Optional error data (e.g. ['status' => 403]).
		 */
		public function __construct( $code = '', $message = '', $data = '' ) {
			if ( empty( $code ) ) {
				return;
			}
			$this->errors[ $code ][] = $message;
			if ( '' !== $data ) {
				$this->error_data[ $code ] = $data;
			}
		}

		/**
		 * @return array<int,string>
		 */
		public function get_error_codes(): array {
			return array_keys( $this->errors );
		}

		/**
		 * @return string
		 */
		public function get_error_code() {
			$codes = $this->get_error_codes();
			return $codes ? $codes[0] : '';
		}

		/**
		 * @param string $code Error code.
		 * @return array<int,string>
		 */
		public function get_error_messages( $code = '' ): array {
			if ( empty( $code ) ) {
				$code = $this->get_error_code();
			}
			return $this->errors[ $code ] ?? array();
		}

		/**
		 * @param string $code Error code.
		 * @return string
		 */
		public function get_error_message( $code = '' ) {
			if ( empty( $code ) ) {
				$code = $this->get_error_code();
			}
			$messages = $this->get_error_messages( $code );
			return $messages ? $messages[0] : '';
		}

		/**
		 * @param string $code Error code.
		 * @return mixed
		 */
		public function get_error_data( $code = '' ) {
			if ( empty( $code ) ) {
				$code = $this->get_error_code();
			}
			return $this->error_data[ $code ] ?? null;
		}

		public function has_errors(): bool {
			return (bool) $this->errors;
		}
	}
}

if ( ! function_exists( 'is_wp_error' ) ) {
	function is_wp_error( $thing ) {
		return $thing instanceof WP_Error;
	}
}
