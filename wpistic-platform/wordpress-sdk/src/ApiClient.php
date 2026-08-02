<?php
/**
 * HTTP client for api.wpistic.com using the WordPress HTTP API.
 * TLS verified, timeouts enforced, one retry on transient failures,
 * errors normalized to WP_Error with the platform's error codes.
 */

namespace WPistic\Sdk;

use WP_Error;

class ApiClient {

	/** @var string */
	private $api_url;

	/** @var string */
	private $product_slug;

	/** @var string */
	private $product_version;

	public function __construct( string $api_url, string $product_slug, string $product_version ) {
		$this->api_url         = rtrim( $api_url, '/' );
		$this->product_slug    = $product_slug;
		$this->product_version = $product_version;
	}

	/**
	 * POST JSON to a platform endpoint.
	 *
	 * @param string               $path e.g. '/api/v1/licenses/activate'.
	 * @param array<string,mixed>  $body
	 * @param array<string,string> $headers
	 * @return array<string,mixed>|WP_Error Decoded JSON on success.
	 */
	public function post( string $path, array $body = array(), array $headers = array() ) {
		return $this->request( 'POST', $path, $body, $headers );
	}

	/**
	 * GET a platform endpoint.
	 *
	 * @param string               $path
	 * @param array<string,string> $query
	 * @return array<string,mixed>|WP_Error
	 */
	public function get( string $path, array $query = array() ) {
		$url = $this->api_url . $path;
		if ( ! empty( $query ) ) {
			$url = add_query_arg( array_map( 'rawurlencode', $query ), $url );
		}
		return $this->request( 'GET', $url, null, array(), true );
	}

	/**
	 * @param string                    $method
	 * @param string                    $path_or_url
	 * @param array<string,mixed>|null  $body
	 * @param array<string,string>      $headers
	 * @param bool                      $is_absolute
	 * @return array<string,mixed>|WP_Error
	 */
	private function request( string $method, string $path_or_url, $body = null, array $headers = array(), bool $is_absolute = false ) {
		$url = $is_absolute ? $path_or_url : $this->api_url . $path_or_url;

		$args = array(
			'method'      => $method,
			'timeout'     => 15,
			'redirection' => 2,
			'sslverify'   => true,
			'headers'     => array_merge(
				array(
					'Accept'           => 'application/json',
					'Content-Type'     => 'application/json',
					'User-Agent'       => sprintf(
						'WPistic-SDK/%1$s (%2$s; WP %3$s; PHP %4$s)',
						$this->product_version,
						$this->product_slug,
						get_bloginfo( 'version' ),
						PHP_VERSION
					),
					'X-Correlation-Id' => self::correlation_id(),
				),
				$headers
			),
		);
		if ( null !== $body ) {
			$args['body'] = wp_json_encode( $body );
		}

		$response = wp_remote_request( $url, $args );

		// One retry on network failure or 5xx — never on 4xx.
		if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) >= 500 ) {
			$response = wp_remote_request( $url, $args );
		}

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'wpistic_network_error', __( 'Could not reach the WPistic licensing service.', 'wpistic-sdk' ), $response );
		}

		$status = wp_remote_retrieve_response_code( $response );
		$json   = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $status >= 400 ) {
			$code    = 'wpistic_api_error';
			$message = __( 'The WPistic licensing service returned an error.', 'wpistic-sdk' );
			if ( is_array( $json ) && isset( $json['error'] ) && is_array( $json['error'] ) ) {
				$code    = isset( $json['error']['code'] ) ? 'wpistic_' . sanitize_key( (string) $json['error']['code'] ) : $code;
				$message = isset( $json['error']['message'] ) ? sanitize_text_field( (string) $json['error']['message'] ) : $message;
			}
			return new WP_Error( $code, $message, array( 'status' => $status ) );
		}

		if ( ! is_array( $json ) ) {
			return new WP_Error( 'wpistic_invalid_response', __( 'Unexpected response from the WPistic licensing service.', 'wpistic-sdk' ) );
		}

		return $json;
	}

	private static function correlation_id(): string {
		if ( function_exists( 'wp_generate_uuid4' ) ) {
			return wp_generate_uuid4();
		}
		return md5( uniqid( 'wpistic', true ) );
	}
}
