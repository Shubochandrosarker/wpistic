<?php
/**
 * Minimal WordPress function/class/constant shims for unit-testing the SDK
 * in isolation, without a full WordPress install. Deliberately narrow: only
 * what DomainNormalizer, HmacVerifier, TokenStorage, GracePeriodManager,
 * Activation, and LicenseManager touch under test — not a general WP stub
 * library. Everything here lives in the global namespace, exactly like the
 * real WordPress functions/classes the SDK's `use WP_Error;` imports expect.
 */

require_once __DIR__ . '/../../vendor/autoload.php';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

if ( ! defined( 'MINUTE_IN_SECONDS' ) ) {
	define( 'MINUTE_IN_SECONDS', 60 );
}
if ( ! defined( 'HOUR_IN_SECONDS' ) ) {
	define( 'HOUR_IN_SECONDS', 60 * MINUTE_IN_SECONDS );
}
if ( ! defined( 'DAY_IN_SECONDS' ) ) {
	define( 'DAY_IN_SECONDS', 24 * HOUR_IN_SECONDS );
}

// ---------------------------------------------------------------------------
// In-memory wp_options + wp_transients (reset explicitly by tests that need
// isolation via wpistic_test_reset_wp_state()).
// ---------------------------------------------------------------------------

$GLOBALS['__wpistic_test_options']    = array();
$GLOBALS['__wpistic_test_transients'] = array();

function wpistic_test_reset_wp_state(): void {
	$GLOBALS['__wpistic_test_options']    = array();
	$GLOBALS['__wpistic_test_transients'] = array();
}

if ( ! function_exists( 'get_option' ) ) {
	function get_option( string $key, $default = false ) {
		return $GLOBALS['__wpistic_test_options'][ $key ] ?? $default;
	}
}
if ( ! function_exists( 'add_option' ) ) {
	function add_option( string $key, $value = '', string $deprecated = '', $autoload = 'yes' ): bool {
		if ( array_key_exists( $key, $GLOBALS['__wpistic_test_options'] ) ) {
			return false;
		}
		$GLOBALS['__wpistic_test_options'][ $key ] = $value;
		return true;
	}
}
if ( ! function_exists( 'update_option' ) ) {
	function update_option( string $key, $value, $autoload = null ): bool {
		$GLOBALS['__wpistic_test_options'][ $key ] = $value;
		return true;
	}
}
if ( ! function_exists( 'delete_option' ) ) {
	function delete_option( string $key ): bool {
		unset( $GLOBALS['__wpistic_test_options'][ $key ] );
		return true;
	}
}
if ( ! function_exists( 'set_transient' ) ) {
	function set_transient( string $key, $value, int $expiration = 0 ): bool {
		$GLOBALS['__wpistic_test_transients'][ $key ] = $value;
		return true;
	}
}
if ( ! function_exists( 'get_transient' ) ) {
	function get_transient( string $key ) {
		return $GLOBALS['__wpistic_test_transients'][ $key ] ?? false;
	}
}
if ( ! function_exists( 'delete_transient' ) ) {
	function delete_transient( string $key ): bool {
		unset( $GLOBALS['__wpistic_test_transients'][ $key ] );
		return true;
	}
}

// ---------------------------------------------------------------------------
// Site identity
// ---------------------------------------------------------------------------

if ( ! function_exists( 'wp_generate_uuid4' ) ) {
	function wp_generate_uuid4(): string {
		$data    = random_bytes( 16 );
		$data[6] = chr( ( ord( $data[6] ) & 0x0f ) | 0x40 );
		$data[8] = chr( ( ord( $data[8] ) & 0x3f ) | 0x80 );
		return vsprintf( '%s%s-%s-%s-%s-%s%s%s', str_split( bin2hex( $data ), 4 ) );
	}
}
if ( ! function_exists( 'wp_parse_url' ) ) {
	function wp_parse_url( string $url, int $component = -1 ) {
		return parse_url( $url, $component );
	}
}
if ( ! function_exists( 'home_url' ) ) {
	function home_url( string $path = '' ): string {
		return 'https://sdk-test.example' . $path;
	}
}
if ( ! function_exists( 'site_url' ) ) {
	function site_url( string $path = '' ): string {
		return 'https://sdk-test.example' . $path;
	}
}
if ( ! function_exists( 'get_bloginfo' ) ) {
	function get_bloginfo( string $show = '' ): string {
		return '6.6';
	}
}
if ( ! function_exists( 'wp_get_environment_type' ) ) {
	function wp_get_environment_type(): string {
		return 'production';
	}
}

// ---------------------------------------------------------------------------
// Security primitives
// ---------------------------------------------------------------------------

if ( ! function_exists( 'wp_salt' ) ) {
	function wp_salt( string $scheme = 'auth' ): string {
		// Fixed per-scheme "salt" for deterministic tests — a real site's
		// wp_salt() is a long random secret defined in wp-config.php.
		return 'unit-test-salt-for-' . $scheme . '-0123456789abcdef0123456789abcdef';
	}
}

// ---------------------------------------------------------------------------
// Escaping / sanitization / i18n (identity/no-op shims — good enough for
// code paths the unit tests actually exercise; not a substitute for WP).
// ---------------------------------------------------------------------------

if ( ! function_exists( 'wp_json_encode' ) ) {
	function wp_json_encode( $data, int $options = 0, int $depth = 512 ) {
		return json_encode( $data, $options, $depth );
	}
}
if ( ! function_exists( '__' ) ) {
	function __( string $text, string $domain = 'default' ): string {
		return $text;
	}
}
if ( ! function_exists( 'esc_html' ) ) {
	function esc_html( string $text ): string {
		return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
	}
}
if ( ! function_exists( 'esc_attr' ) ) {
	function esc_attr( string $text ): string {
		return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
	}
}
if ( ! function_exists( 'esc_url' ) ) {
	function esc_url( string $url ): string {
		return filter_var( $url, FILTER_SANITIZE_URL );
	}
}
if ( ! function_exists( 'esc_url_raw' ) ) {
	function esc_url_raw( string $url ): string {
		return filter_var( $url, FILTER_SANITIZE_URL );
	}
}
if ( ! function_exists( 'sanitize_text_field' ) ) {
	function sanitize_text_field( string $text ): string {
		return trim( wp_strip_all_tags( $text ) );
	}
}
if ( ! function_exists( 'wp_strip_all_tags' ) ) {
	function wp_strip_all_tags( string $text ): string {
		return trim( preg_replace( '/<[^>]*>/', '', $text ) );
	}
}
if ( ! function_exists( 'sanitize_key' ) ) {
	function sanitize_key( string $key ): string {
		return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( $key ) );
	}
}
if ( ! function_exists( 'wp_unslash' ) ) {
	function wp_unslash( $value ) {
		return is_string( $value ) ? stripslashes( $value ) : $value;
	}
}

// ---------------------------------------------------------------------------
// WP_Error / is_wp_error — the real WP_Error API surface this SDK uses.
// ---------------------------------------------------------------------------

if ( ! class_exists( 'WP_Error' ) ) {
	class WP_Error {

		/** @var array<string,array<int,string>> */
		public $errors = array();

		/** @var array<string,mixed> */
		public $error_data = array();

		/**
		 * @param mixed $data
		 */
		public function __construct( string $code = '', string $message = '', $data = '' ) {
			if ( '' === $code ) {
				return;
			}
			$this->errors[ $code ][] = $message;
			if ( '' !== $data ) {
				$this->error_data[ $code ] = $data;
			}
		}

		public function get_error_code(): string {
			$codes = array_keys( $this->errors );
			return $codes[0] ?? '';
		}

		public function get_error_message( string $code = '' ): string {
			if ( '' === $code ) {
				$code = $this->get_error_code();
			}
			return $this->errors[ $code ][0] ?? '';
		}

		/**
		 * @return mixed
		 */
		public function get_error_data( string $code = '' ) {
			if ( '' === $code ) {
				$code = $this->get_error_code();
			}
			return $this->error_data[ $code ] ?? null;
		}
	}
}
if ( ! function_exists( 'is_wp_error' ) ) {
	function is_wp_error( $thing ): bool {
		return $thing instanceof WP_Error;
	}
}
