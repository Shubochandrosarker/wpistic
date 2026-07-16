<?php
/**
 * Tests for WPistic\Core\Support\Security.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\Support;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\Support\Security;

final class SecurityTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_hash_token_is_deterministic_hmac_of_secret_and_salt(): void {
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );

		$hash = Security::hash_token( 'my-secret' );

		$this->assertSame( hash_hmac( 'sha256', 'my-secret', 'unit-test-salt' ), $hash );
		$this->assertSame( 64, strlen( $hash ) );
	}

	public function test_hash_token_differs_for_different_secrets(): void {
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );

		$this->assertNotSame(
			Security::hash_token( 'secret-a' ),
			Security::hash_token( 'secret-b' )
		);
	}

	public function test_verify_token_accepts_the_matching_secret(): void {
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );

		$hash = Security::hash_token( 'correct-secret' );

		$this->assertTrue( Security::verify_token( 'correct-secret', $hash ) );
	}

	public function test_verify_token_rejects_a_wrong_secret(): void {
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );

		$hash = Security::hash_token( 'correct-secret' );

		$this->assertFalse( Security::verify_token( 'wrong-secret', $hash ) );
	}

	public function test_verify_token_rejects_an_empty_secret_against_a_real_hash(): void {
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );

		$hash = Security::hash_token( 'correct-secret' );

		$this->assertFalse( Security::verify_token( '', $hash ) );
	}

	public function test_verify_token_rejects_an_empty_stored_hash(): void {
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );

		$this->assertFalse( Security::verify_token( 'anything', '' ) );
	}

	public function test_generate_api_key_has_the_expected_shape(): void {
		$key = Security::generate_api_key();

		$this->assertMatchesRegularExpression( '/^wpk_[0-9a-f]{8}$/', $key['prefix'] );
		$this->assertMatchesRegularExpression( '/^[0-9a-f]{48}$/', $key['secret'] );
		$this->assertSame( $key['prefix'] . '.' . $key['secret'], $key['plain'] );
	}

	public function test_generate_api_key_is_unique_per_call(): void {
		$first  = Security::generate_api_key();
		$second = Security::generate_api_key();

		$this->assertNotSame( $first['prefix'], $second['prefix'] );
		$this->assertNotSame( $first['secret'], $second['secret'] );
	}

	public function test_sanitize_deep_applies_sanitization_to_nested_strings(): void {
		Functions\when( 'sanitize_text_field' )->alias(
			static fn( $value ) => trim( (string) $value ) . '|clean'
		);

		$input = array(
			'name' => ' Ada ',
			'meta' => array( 'nickname' => ' Lovelace ' ),
		);

		$result = Security::sanitize_deep( $input );

		$this->assertSame( 'Ada|clean', $result['name'] );
		$this->assertSame( 'Lovelace|clean', $result['meta']['nickname'] );
	}

	public function test_sanitize_deep_passes_through_non_string_scalars(): void {
		$input = array(
			'count'   => 3,
			'active'  => true,
			'nothing' => null,
		);

		$result = Security::sanitize_deep( $input );

		$this->assertSame( 3, $result['count'] );
		$this->assertTrue( $result['active'] );
		$this->assertNull( $result['nothing'] );
	}

	public function test_sanitize_deep_handles_an_empty_array(): void {
		$this->assertSame( array(), Security::sanitize_deep( array() ) );
	}

	public function test_normalize_url_accepts_a_valid_url_and_strips_trailing_slash(): void {
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		Functions\when( 'wp_http_validate_url' )->justReturn( true );
		Functions\when( 'untrailingslashit' )->alias( static fn( $url ) => rtrim( $url, '/' ) );

		$this->assertSame(
			'https://example.com',
			Security::normalize_url( '  https://example.com/  ' )
		);
	}

	public function test_normalize_url_rejects_an_empty_string(): void {
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		Functions\when( 'wp_http_validate_url' )->justReturn( false );

		$this->assertNull( Security::normalize_url( '   ' ) );
	}

	public function test_normalize_url_rejects_a_malformed_url(): void {
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		Functions\when( 'wp_http_validate_url' )->justReturn( false );

		$this->assertNull( Security::normalize_url( 'not a url' ) );
	}
}
