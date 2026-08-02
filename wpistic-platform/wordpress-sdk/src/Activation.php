<?php
/**
 * Site identity for activations: stable installation UUID, normalized
 * domain, environment detection, and the activation payload.
 */

namespace WPistic\Sdk;

class Activation {

	/** @var string */
	private $product_slug;

	/** @var string */
	private $product_version;

	public function __construct( string $product_slug, string $product_version ) {
		$this->product_slug    = $product_slug;
		$this->product_version = $product_version;
	}

	/**
	 * Stable per-install UUID, shared by every WPistic plugin on the site so
	 * the platform's website registry sees one installation identity.
	 */
	public function installation_uuid(): string {
		$uuid = get_option( 'wpistic_installation_uuid' );
		if ( ! is_string( $uuid ) || '' === $uuid ) {
			$uuid = wp_generate_uuid4();
			add_option( 'wpistic_installation_uuid', $uuid, '', 'no' );
		}
		return $uuid;
	}

	public function domain(): string {
		$host = wp_parse_url( home_url(), PHP_URL_HOST );
		return is_string( $host ) ? strtolower( $host ) : '';
	}

	/**
	 * Environment: WordPress' own declaration first, host heuristics second.
	 * The platform re-validates server-side — this is advisory.
	 */
	public function environment(): string {
		$wp_env = function_exists( 'wp_get_environment_type' ) ? wp_get_environment_type() : 'production';
		if ( in_array( $wp_env, array( 'local', 'development', 'staging' ), true ) ) {
			return 'development' === $wp_env ? 'development' : $wp_env;
		}

		$host = $this->domain();
		if ( preg_match( '/^(localhost|127\.|10\.|192\.168\.)/', $host ) || preg_match( '/\.(local|test|localhost)$/', $host ) ) {
			return 'local';
		}
		if ( preg_match( '/^(staging|dev|stage)\./', $host ) ) {
			return 'staging';
		}
		return 'production';
	}

	/**
	 * @return array<string,string>
	 */
	public function payload(): array {
		return array(
			'domain'            => $this->domain(),
			'installation_uuid' => $this->installation_uuid(),
			'site_url'          => site_url(),
			'home_url'          => home_url(),
			'environment'       => $this->environment(),
			'product_version'   => $this->product_version,
			'wp_version'        => get_bloginfo( 'version' ),
			'php_version'       => PHP_VERSION,
		);
	}

	public function product_slug(): string {
		return $this->product_slug;
	}
}
