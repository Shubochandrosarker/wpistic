<?php
/**
 * LicenseManager: activation flow against a mocked HTTP client (FakeApiClient
 * — no real network call is ever made), verifying the exact payload shapes
 * the platform contract requires and that stored state is encrypted at
 * rest (never plaintext in wp_options).
 */

namespace WPistic\Sdk\Tests;

use PHPUnit\Framework\TestCase;
use WPistic\Sdk\Activation;
use WPistic\Sdk\GracePeriodManager;
use WPistic\Sdk\LicenseManager;
use WPistic\Sdk\Security\TokenStorage;
use WPistic\Sdk\Tests\Fakes\FakeApiClient;

class LicenseManagerTest extends TestCase {

	private const VERIFICATION_KEY_HEX = '9c1f4a7e2b6d8c0a3f5e9b1d7a4c6e8f0b2d4a6c8e0f2b4d6a8c0e2f4b6d8a10';
	private const GOLDEN_SIGNATURE      = 'c92bc8d4248a9b5e066324d95709c6d6064bd86d69302e40fa9cc84df7e1b9a9';
	private const OPTION_KEY             = 'wpistic_seoistic_license';

	protected function setUp(): void {
		wpistic_test_reset_wp_state();
	}

	/**
	 * @return array<string,mixed>
	 */
	private function golden_response( bool $with_signature = true ): array {
		$response = array(
			'valid'                => true,
			'status'               => 'active',
			'grace_period_ends_at' => null,
			'product'              => 'seoistic',
			'plan'                 => 'pro',
			'expires_at'           => '2027-01-01T00:00:00.000Z',
			'activation'           => array(
				'id'          => 'activation-1',
				'domain'      => 'sdk-test.example',
				'environment' => 'production',
			),
			'entitlements'         => array(
				'seoistic.pro.enabled' => true,
				'seoistic.sites.max'   => 5,
			),
			'updates'              => array( 'channel' => 'stable', 'allowed' => true ),
			'check_after'          => 100,
			'grace_period_days'    => 7,
		);
		if ( $with_signature ) {
			$response['signature'] = self::GOLDEN_SIGNATURE;
		}
		return $response;
	}

	private function make_manager( FakeApiClient $api ): LicenseManager {
		return new LicenseManager(
			$api,
			new Activation( 'seoistic', '1.4.0' ),
			new TokenStorage( 'unit-test-key-material' ),
			new GracePeriodManager(),
			self::OPTION_KEY
		);
	}

	public function test_activate_sends_the_documented_payload_shape(): void {
		$api = new FakeApiClient();
		$api->queue_response(
			'/api/v1/licenses/activate',
			array(
				'activation_token' => 'jwt.activation.token',
				'verification_key' => self::VERIFICATION_KEY_HEX,
			) + $this->golden_response()
		);

		$manager = $this->make_manager( $api );
		$result  = $manager->activate( 'seoistic_rawkeyvaluehere1234' );

		$this->assertTrue( $result );
		$this->assertSame( 1, $api->call_count() );

		$call = $api->last_call();
		$this->assertSame( 'POST', $call['method'] );
		$this->assertSame( '/api/v1/licenses/activate', $call['path'] );

		// Exact documented shape: {key, domain, installation_uuid, site_url,
		// home_url, environment, product_version, wp_version, php_version}.
		$body = $call['body'];
		$this->assertSame( 'seoistic_rawkeyvaluehere1234', $body['key'] );
		$this->assertArrayHasKey( 'domain', $body );
		$this->assertArrayHasKey( 'installation_uuid', $body );
		$this->assertArrayHasKey( 'site_url', $body );
		$this->assertArrayHasKey( 'home_url', $body );
		$this->assertArrayHasKey( 'environment', $body );
		$this->assertSame( '1.4.0', $body['product_version'] );
		$this->assertArrayHasKey( 'wp_version', $body );
		$this->assertArrayHasKey( 'php_version', $body );
		$this->assertSame( 'sdk-test.example', $body['domain'] );
		$this->assertSame( 'production', $body['environment'] );

		// Idempotency header carries the installation uuid + key hash, never the raw key alone.
		$this->assertArrayHasKey( 'X-Idempotency-Key', $call['headers'] );
		$this->assertStringNotContainsString( 'rawkeyvaluehere', $call['headers']['X-Idempotency-Key'] );
	}

	public function test_activate_rejects_empty_key_without_calling_the_api(): void {
		$api     = new FakeApiClient();
		$manager = $this->make_manager( $api );

		$result = $manager->activate( '   ' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'wpistic_empty_key', $result->get_error_code() );
		$this->assertSame( 0, $api->call_count() );
	}

	public function test_activate_stores_state_encrypted_not_plaintext(): void {
		$api = new FakeApiClient();
		$api->queue_response(
			'/api/v1/licenses/activate',
			array(
				'activation_token' => 'super-secret-jwt-value',
				'verification_key' => self::VERIFICATION_KEY_HEX,
			) + $this->golden_response()
		);

		$manager = $this->make_manager( $api );
		$manager->activate( 'seoistic_rawkeyvaluehere1234' );

		$stored = get_option( self::OPTION_KEY );
		$this->assertIsString( $stored );
		$this->assertStringNotContainsString( 'super-secret-jwt-value', $stored );
		$this->assertStringNotContainsString( self::VERIFICATION_KEY_HEX, $stored );

		// But the manager can still read it back correctly through TokenStorage.
		$this->assertSame( 'super-secret-jwt-value', $manager->activation_token() );
	}

	public function test_activate_reports_wp_error_on_incomplete_response(): void {
		$api = new FakeApiClient();
		$api->queue_response( '/api/v1/licenses/activate', array( 'valid' => true ) ); // missing activation_token/verification_key

		$manager = $this->make_manager( $api );
		$result  = $manager->activate( 'seoistic_rawkeyvaluehere1234' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'wpistic_invalid_activation', $result->get_error_code() );
	}

	public function test_activate_passes_through_network_error(): void {
		$api = new FakeApiClient();
		$api->queue_response( '/api/v1/licenses/activate', new \WP_Error( 'wpistic_network_error', 'boom' ) );

		$manager = $this->make_manager( $api );
		$result  = $manager->activate( 'seoistic_rawkeyvaluehere1234' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'wpistic_network_error', $result->get_error_code() );
	}

	public function test_is_premium_active_after_successful_activation(): void {
		$api = new FakeApiClient();
		$api->queue_response(
			'/api/v1/licenses/activate',
			array(
				'activation_token' => 'jwt.activation.token',
				'verification_key' => self::VERIFICATION_KEY_HEX,
			) + $this->golden_response()
		);

		$manager = $this->make_manager( $api );
		$manager->activate( 'seoistic_rawkeyvaluehere1234' );

		$this->assertTrue( $manager->is_connected() );
		$this->assertTrue( $manager->is_premium_active( time() ) );
		$this->assertSame(
			array( 'seoistic.pro.enabled' => true, 'seoistic.sites.max' => 5 ),
			$manager->entitlements_map( time() )
		);
	}

	public function test_is_premium_active_is_false_when_signature_is_tampered(): void {
		$api = new FakeApiClient();
		$response = ( array( 'activation_token' => 't', 'verification_key' => self::VERIFICATION_KEY_HEX ) ) + $this->golden_response();
		$api->queue_response( '/api/v1/licenses/activate', $response );

		$manager = $this->make_manager( $api );
		$manager->activate( 'seoistic_rawkeyvaluehere1234' );

		// Directly corrupt the cached response's plan field, bypassing the API,
		// to simulate a tampered/mismatched cache — signature no longer matches.
		$now = time();
		$this->assertTrue( $manager->is_premium_active( $now ) ); // sanity: valid beforehand

		update_option( self::OPTION_KEY, ( new TokenStorage( 'unit-test-key-material' ) )->encrypt(
			wp_json_encode(
				array(
					'activation_token' => 't',
					'verification_key' => self::VERIFICATION_KEY_HEX,
					'key_mask'         => 'seoistic_****xxxx',
					'validated_at'     => $now,
					'response'         => array_merge( $this->golden_response(), array( 'plan' => 'enterprise' ) ),
				)
			)
		) );

		$this->assertFalse( $manager->is_premium_active( $now ) );
	}

	public function test_validate_now_sends_domain_environment_installation_uuid_and_plugin_version(): void {
		$api = new FakeApiClient();
		$api->queue_response(
			'/api/v1/licenses/activate',
			array( 'activation_token' => 'jwt.activation.token', 'verification_key' => self::VERIFICATION_KEY_HEX ) + $this->golden_response()
		);
		$api->queue_response( '/api/v1/licenses/validate', $this->golden_response() );

		$manager = $this->make_manager( $api );
		$manager->activate( 'seoistic_rawkeyvaluehere1234' );

		$result = $manager->validate_now();
		$this->assertTrue( $result );

		$validate_call = $api->calls()[1];
		$this->assertSame( '/api/v1/licenses/validate', $validate_call['path'] );
		$this->assertSame( 'jwt.activation.token', $validate_call['body']['activation_token'] );
		$this->assertSame( 'sdk-test.example', $validate_call['body']['domain'] );
		$this->assertSame( 'production', $validate_call['body']['environment'] );
		$this->assertSame( '1.4.0', $validate_call['body']['plugin_version'] );
		$this->assertArrayHasKey( 'installation_uuid', $validate_call['body'] );
	}

	public function test_validate_now_rejects_response_with_bad_signature(): void {
		$api = new FakeApiClient();
		$api->queue_response(
			'/api/v1/licenses/activate',
			array( 'activation_token' => 'jwt.activation.token', 'verification_key' => self::VERIFICATION_KEY_HEX ) + $this->golden_response()
		);
		$tampered = $this->golden_response();
		$tampered['plan'] = 'enterprise'; // signature no longer matches
		$api->queue_response( '/api/v1/licenses/validate', $tampered );

		$manager = $this->make_manager( $api );
		$manager->activate( 'seoistic_rawkeyvaluehere1234' );
		$result = $manager->validate_now();

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'wpistic_signature_invalid', $result->get_error_code() );
	}

	public function test_deactivate_sends_activation_token_and_installation_uuid_then_clears_state(): void {
		$api = new FakeApiClient();
		$api->queue_response(
			'/api/v1/licenses/activate',
			array( 'activation_token' => 'jwt.activation.token', 'verification_key' => self::VERIFICATION_KEY_HEX ) + $this->golden_response()
		);
		$api->queue_response( '/api/v1/licenses/deactivate', array( 'deactivated' => true ) );

		$manager = $this->make_manager( $api );
		$manager->activate( 'seoistic_rawkeyvaluehere1234' );
		$result = $manager->deactivate();

		$this->assertTrue( $result );
		$deactivate_call = $api->calls()[1];
		$this->assertSame( '/api/v1/licenses/deactivate', $deactivate_call['path'] );
		$this->assertSame( 'jwt.activation.token', $deactivate_call['body']['activation_token'] );
		$this->assertArrayHasKey( 'installation_uuid', $deactivate_call['body'] );

		$this->assertFalse( $manager->is_connected() );
		$this->assertFalse( get_option( self::OPTION_KEY ) );
	}

	public function test_deactivate_without_prior_activation_is_a_no_op_success(): void {
		$api     = new FakeApiClient();
		$manager = $this->make_manager( $api );

		$this->assertTrue( $manager->deactivate() );
		$this->assertSame( 0, $api->call_count() );
	}
}
