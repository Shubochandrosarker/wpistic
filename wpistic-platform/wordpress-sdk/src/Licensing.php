<?php
/**
 * Licensing orchestrator: activation, scheduled re-validation, offline
 * signature verification, grace-period resilience, and entitlement access.
 *
 * Storage (wp_options, autoload off):
 *   wpistic_{slug}_license = [
 *     'activation_token'  => JWT used against validate/refresh/deactivate,
 *     'verification_key'  => per-license HMAC key (hex) for offline checks,
 *     'key_mask'          => masked key for display,
 *     'response'          => last signed validation response,
 *     'validated_at'      => unix time of last successful remote validation,
 *   ]
 *
 * The raw license key is sent to the platform once at activation and never
 * stored. Premium features degrade gracefully: valid cached response →
 * active; API unreachable → active through the grace period with admin
 * notices; after that features turn off — nothing destructive.
 */

namespace WPistic\Sdk;

use WP_Error;

class Licensing {

	public const DEFAULT_API_URL = 'https://api.wpistic.com';

	/** @var array{product_slug:string,product_version:string,plugin_file:string,api_url:string} */
	private $config;

	/** @var ApiClient */
	private $api;

	/** @var Activation */
	private $activation;

	/** @var Entitlements|null */
	private $entitlements = null;

	/**
	 * @param array{product_slug:string,product_version:string,plugin_file:string,api_url?:string} $config
	 */
	public function __construct( array $config ) {
		$this->config = array(
			'product_slug'    => $config['product_slug'],
			'product_version' => $config['product_version'],
			'plugin_file'     => $config['plugin_file'],
			'api_url'         => isset( $config['api_url'] ) ? $config['api_url'] : self::DEFAULT_API_URL,
		);
		$this->api        = new ApiClient( $this->config['api_url'], $this->config['product_slug'], $this->config['product_version'] );
		$this->activation = new Activation( $this->config['product_slug'], $this->config['product_version'] );
	}

	/** Wire cron + updater + admin UI. Call from the plugin's main file. */
	public function boot(): void {
		$hook = $this->cron_hook();
		add_action( $hook, array( $this, 'scheduled_validation' ) );
		if ( ! wp_next_scheduled( $hook ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'twicedaily', $hook );
		}
		register_deactivation_hook( $this->config['plugin_file'], array( $this, 'clear_schedule' ) );

		( new Updater( $this ) )->register();
		( new Admin( $this ) )->register();
	}

	public function clear_schedule(): void {
		wp_clear_scheduled_hook( $this->cron_hook() );
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	/**
	 * Activate with a raw key (from the settings form). The key is not stored.
	 *
	 * @return true|WP_Error
	 */
	public function activate( string $raw_key ) {
		$raw_key = trim( $raw_key );
		if ( '' === $raw_key ) {
			return new WP_Error( 'wpistic_empty_key', __( 'Enter your license key.', 'wpistic-sdk' ) );
		}

		$response = $this->api->post(
			'/api/v1/licenses/activate',
			array_merge( array( 'key' => $raw_key ), $this->activation->payload() ),
			array( 'X-Idempotency-Key' => $this->activation->installation_uuid() . '-' . md5( $raw_key ) )
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		if ( empty( $response['activation_token'] ) || empty( $response['verification_key'] ) ) {
			return new WP_Error( 'wpistic_invalid_activation', __( 'Activation response was incomplete.', 'wpistic-sdk' ) );
		}

		$this->store(
			array(
				'activation_token' => (string) $response['activation_token'],
				'verification_key' => (string) $response['verification_key'],
				'key_mask'         => $this->mask_key( $raw_key ),
				'response'         => $response,
				'validated_at'     => time(),
			)
		);
		$this->entitlements = null;
		return true;
	}

	/** @return true|WP_Error */
	public function deactivate() {
		$state = $this->state();
		if ( empty( $state['activation_token'] ) ) {
			return true;
		}
		$result = $this->api->post(
			'/api/v1/licenses/deactivate',
			array(
				'activation_token'  => $state['activation_token'],
				'installation_uuid' => $this->activation->installation_uuid(),
			)
		);
		// Local state clears even if the remote call failed — the platform
		// side can be cleaned up from the dashboard.
		delete_option( $this->option_key() );
		$this->entitlements = null;
		return is_wp_error( $result ) ? $result : true;
	}

	/** Cron: revalidate and rotate the activation token when close to expiry. */
	public function scheduled_validation(): void {
		$state = $this->state();
		if ( empty( $state['activation_token'] ) ) {
			return;
		}

		$response = $this->api->post( '/api/v1/licenses/validate', array( 'activation_token' => $state['activation_token'] ) );

		if ( is_wp_error( $response ) ) {
			// Unreachable — the grace period (below) keeps features alive.
			return;
		}

		if ( ! $this->verify_signature( $response, (string) $state['verification_key'] ) ) {
			// A response that fails signature verification is never trusted.
			return;
		}

		$state['response']     = $response;
		$state['validated_at'] = time();
		$this->store( $state );
		$this->entitlements = null;

		// Refresh the activation token once it is past half its lifetime.
		$refreshed = $this->api->post( '/api/v1/licenses/refresh', array( 'activation_token' => $state['activation_token'] ) );
		if ( ! is_wp_error( $refreshed ) && ! empty( $refreshed['activation_token'] ) ) {
			$state['activation_token'] = (string) $refreshed['activation_token'];
			$this->store( $state );
		}
	}

	// -------------------------------------------------------------------------
	// State queries
	// -------------------------------------------------------------------------

	public function is_connected(): bool {
		$state = $this->state();
		return ! empty( $state['activation_token'] );
	}

	/**
	 * Are premium features available right now?
	 * Valid cached response within check_after → yes. Stale but inside the
	 * grace window → yes. Beyond grace, or invalid/revoked → no.
	 */
	public function is_premium_active(): bool {
		$state = $this->state();
		if ( empty( $state['response'] ) || empty( $state['validated_at'] ) ) {
			return false;
		}
		$response = $state['response'];
		if ( empty( $response['valid'] ) ) {
			return false;
		}
		if ( ! $this->verify_signature( $response, (string) $state['verification_key'] ) ) {
			return false;
		}

		$age         = time() - (int) $state['validated_at'];
		$check_after = isset( $response['check_after'] ) ? (int) $response['check_after'] : 43200;
		$grace_days  = isset( $response['grace_period_days'] ) ? (int) $response['grace_period_days'] : 7;

		return $age <= ( $check_after * 2 ) + ( $grace_days * DAY_IN_SECONDS );
	}

	/** Seconds until grace expires; null when not in grace. */
	public function grace_seconds_remaining(): ?int {
		$state = $this->state();
		if ( empty( $state['response'] ) || empty( $state['validated_at'] ) || empty( $state['response']['valid'] ) ) {
			return null;
		}
		$age         = time() - (int) $state['validated_at'];
		$check_after = isset( $state['response']['check_after'] ) ? (int) $state['response']['check_after'] : 43200;
		$grace_days  = isset( $state['response']['grace_period_days'] ) ? (int) $state['response']['grace_period_days'] : 7;
		$grace_start = $check_after * 2;
		if ( $age <= $grace_start ) {
			return null;
		}
		return max( 0, ( $grace_start + $grace_days * DAY_IN_SECONDS ) - $age );
	}

	public function entitlements(): Entitlements {
		if ( null === $this->entitlements ) {
			$state = $this->state();
			$map   = array();
			if ( $this->is_premium_active() && isset( $state['response']['entitlements'] ) && is_array( $state['response']['entitlements'] ) ) {
				$map = $state['response']['entitlements'];
			}
			$this->entitlements = new Entitlements( $map );
		}
		return $this->entitlements;
	}

	/** @return array<string,mixed> Sanitized status for the settings screen. */
	public function status(): array {
		$state    = $this->state();
		$response = isset( $state['response'] ) && is_array( $state['response'] ) ? $state['response'] : array();
		return array(
			'connected'    => $this->is_connected(),
			'active'       => $this->is_premium_active(),
			'key_mask'     => isset( $state['key_mask'] ) ? (string) $state['key_mask'] : '',
			'plan'         => isset( $response['plan'] ) ? (string) $response['plan'] : '',
			'status'       => isset( $response['status'] ) ? (string) $response['status'] : 'not_connected',
			'expires_at'   => isset( $response['expires_at'] ) ? (string) $response['expires_at'] : '',
			'validated_at' => isset( $state['validated_at'] ) ? (int) $state['validated_at'] : 0,
			'grace_left'   => $this->grace_seconds_remaining(),
		);
	}

	// -------------------------------------------------------------------------
	// Internals (shared with Updater/Admin)
	// -------------------------------------------------------------------------

	public function api(): ApiClient {
		return $this->api;
	}

	public function activation_helper(): Activation {
		return $this->activation;
	}

	public function product_slug(): string {
		return $this->config['product_slug'];
	}

	public function product_version(): string {
		return $this->config['product_version'];
	}

	public function plugin_file(): string {
		return $this->config['plugin_file'];
	}

	public function activation_token(): string {
		$state = $this->state();
		return isset( $state['activation_token'] ) ? (string) $state['activation_token'] : '';
	}

	/**
	 * Offline HMAC verification of a signed platform response using the
	 * per-license verification key. Canonical form matches the platform:
	 * recursively key-sorted JSON, no whitespace, unescaped slashes/unicode,
	 * `signature` excluded.
	 *
	 * @param array<string,mixed> $response
	 */
	public function verify_signature( array $response, string $verification_key_hex ): bool {
		if ( empty( $response['signature'] ) || '' === $verification_key_hex ) {
			return false;
		}
		$signature = (string) $response['signature'];
		unset( $response['signature'] );

		$canonical = self::canonical_json( $response );
		$binary_key = pack( 'H*', $verification_key_hex );
		$expected   = base64_encode( hash_hmac( 'sha256', $canonical, $binary_key, true ) );

		return hash_equals( $expected, $signature );
	}

	/**
	 * @param mixed $value
	 */
	public static function canonical_json( $value ): string {
		if ( is_array( $value ) ) {
			$is_list = array_keys( $value ) === range( 0, count( $value ) - 1 );
			if ( $is_list && array() !== $value ) {
				$parts = array();
				foreach ( $value as $item ) {
					$parts[] = self::canonical_json( $item );
				}
				return '[' . implode( ',', $parts ) . ']';
			}
			ksort( $value, SORT_STRING );
			$parts = array();
			foreach ( $value as $k => $v ) {
				$parts[] = wp_json_encode( (string) $k, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . ':' . self::canonical_json( $v );
			}
			return '{' . implode( ',', $parts ) . '}';
		}
		return wp_json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
	}

	private function cron_hook(): string {
		return 'wpistic_' . $this->config['product_slug'] . '_validate';
	}

	private function option_key(): string {
		return 'wpistic_' . $this->config['product_slug'] . '_license';
	}

	/** @return array<string,mixed> */
	private function state(): array {
		$state = get_option( $this->option_key() );
		return is_array( $state ) ? $state : array();
	}

	/** @param array<string,mixed> $state */
	private function store( array $state ): void {
		update_option( $this->option_key(), $state, false );
	}

	private function mask_key( string $raw_key ): string {
		$prefix = $this->config['product_slug'] . '_';
		$tail   = substr( $raw_key, -4 );
		return $prefix . '****' . $tail;
	}
}
