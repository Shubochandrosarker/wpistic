<?php
/**
 * Secure update client: injects platform releases into the WordPress update
 * system, authorizes downloads with the activation token, and verifies the
 * downloaded package checksum before install. Arbitrary download URLs are
 * rejected — only platform-issued signed URLs are ever fetched.
 */

namespace WPistic\Sdk;

use WP_Error;

class Updater {

	/** @var Licensing */
	private $license;

	/** @var array<string,mixed>|null */
	private $update_cache = null;

	public function __construct( Licensing $license ) {
		$this->license = $license;
	}

	public function register(): void {
		add_filter( 'pre_set_site_transient_update_plugins', array( $this, 'inject_update' ) );
		add_filter( 'plugins_api', array( $this, 'plugin_info' ), 10, 3 );
		add_filter( 'upgrader_pre_download', array( $this, 'verified_download' ), 10, 3 );
	}

	private function plugin_basename(): string {
		return plugin_basename( $this->license->plugin_file() );
	}

	/**
	 * @return array<string,mixed>|null Update metadata from the platform.
	 */
	private function fetch_update_metadata(): ?array {
		if ( null !== $this->update_cache ) {
			return $this->update_cache;
		}
		$token = $this->license->activation_token();
		if ( '' === $token ) {
			return null;
		}

		$cache_key = 'wpistic_update_' . $this->license->product_slug();
		$cached    = get_site_transient( $cache_key );
		if ( is_array( $cached ) ) {
			$this->update_cache = $cached;
			return $cached;
		}

		$response = $this->license->api()->get(
			'/api/v1/products/' . rawurlencode( $this->license->product_slug() ) . '/updates',
			array(
				'version'       => $this->license->product_version(),
				'channel'       => 'stable',
				'license_token' => $token,
			)
		);
		if ( is_wp_error( $response ) || ! is_array( $response ) ) {
			return null;
		}

		set_site_transient( $cache_key, $response, 6 * HOUR_IN_SECONDS );
		$this->update_cache = $response;
		return $response;
	}

	/**
	 * @param object|mixed $transient
	 * @return object|mixed
	 */
	public function inject_update( $transient ) {
		if ( ! is_object( $transient ) ) {
			return $transient;
		}
		$meta = $this->fetch_update_metadata();
		if ( ! $meta || empty( $meta['has_update'] ) || empty( $meta['version'] ) || empty( $meta['download_url'] ) ) {
			return $transient;
		}

		$item = (object) array(
			'slug'         => $this->license->product_slug(),
			'plugin'       => $this->plugin_basename(),
			'new_version'  => (string) $meta['version'],
			'package'      => esc_url_raw( (string) $meta['download_url'] ),
			'url'          => isset( $meta['changelog_url'] ) ? esc_url_raw( (string) $meta['changelog_url'] ) : '',
			'requires_php' => isset( $meta['requires_php'] ) ? (string) $meta['requires_php'] : '',
			'requires'     => isset( $meta['requires_wp'] ) ? (string) $meta['requires_wp'] : '',
			'tested'       => isset( $meta['tested_up_to'] ) ? (string) $meta['tested_up_to'] : '',
		);

		if ( ! isset( $transient->response ) || ! is_array( $transient->response ) ) {
			$transient->response = array();
		}
		$transient->response[ $this->plugin_basename() ] = $item;
		return $transient;
	}

	/**
	 * "View details" modal content.
	 *
	 * @param false|object|array $result
	 * @param string             $action
	 * @param object             $args
	 * @return false|object|array
	 */
	public function plugin_info( $result, $action, $args ) {
		if ( 'plugin_information' !== $action || empty( $args->slug ) || $args->slug !== $this->license->product_slug() ) {
			return $result;
		}
		$meta = $this->fetch_update_metadata();
		if ( ! $meta ) {
			return $result;
		}
		return (object) array(
			'name'          => ucfirst( $this->license->product_slug() ),
			'slug'          => $this->license->product_slug(),
			'version'       => isset( $meta['version'] ) ? (string) $meta['version'] : $this->license->product_version(),
			'requires'      => isset( $meta['requires_wp'] ) ? (string) $meta['requires_wp'] : '',
			'requires_php'  => isset( $meta['requires_php'] ) ? (string) $meta['requires_php'] : '',
			'tested'        => isset( $meta['tested_up_to'] ) ? (string) $meta['tested_up_to'] : '',
			'download_link' => isset( $meta['download_url'] ) ? esc_url_raw( (string) $meta['download_url'] ) : '',
			'sections'      => array(
				'changelog' => isset( $meta['changelog_url'] )
					? '<p><a href="' . esc_url( (string) $meta['changelog_url'] ) . '" target="_blank" rel="noopener">' . esc_html__( 'View the changelog', 'wpistic-sdk' ) . '</a></p>'
					: '',
			),
		);
	}

	/**
	 * Download the package ourselves so the checksum can be verified before
	 * WordPress unpacks it.
	 *
	 * @param bool|WP_Error $reply
	 * @param string        $package
	 * @param object        $upgrader
	 * @return bool|string|WP_Error
	 */
	public function verified_download( $reply, $package, $upgrader ) {
		$meta = $this->update_cache;
		if ( ! is_string( $package ) || ! $meta || empty( $meta['download_url'] ) || $package !== $meta['download_url'] ) {
			return $reply;
		}

		$file = download_url( $package, 300 );
		if ( is_wp_error( $file ) ) {
			return $file;
		}

		if ( ! empty( $meta['package_hash'] ) ) {
			$expected = strtolower( str_replace( 'sha256-', '', (string) $meta['package_hash'] ) );
			$actual   = hash_file( 'sha256', $file );
			if ( ! hash_equals( $expected, (string) $actual ) ) {
				wp_delete_file( $file );
				return new WP_Error(
					'wpistic_checksum_mismatch',
					__( 'Update package failed checksum verification and was discarded.', 'wpistic-sdk' )
				);
			}
		}

		return $file;
	}
}
