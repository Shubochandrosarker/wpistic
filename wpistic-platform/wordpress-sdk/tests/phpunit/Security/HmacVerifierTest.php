<?php
/**
 * HmacVerifier tests against a fixed golden vector, computed independently
 * of the class under test (see notes below) — this proves the PHP
 * implementation matches the documented algorithm precisely:
 *
 *   signature = hex( HMAC-SHA256( derived_key_bytes, canonical_json(payload) ) )
 *
 * matching apps/api/src/utils/crypto.ts's deriveLicenseKey()/signLicenseResponse()
 * contract exactly (hex throughout, no base64).
 *
 * The golden signature below was derived once via an independent PHP
 * one-liner (raw hash_hmac() + a hand-written canonical JSON string, not
 * via HmacVerifier::canonical_json()) so this test does not validate
 * HmacVerifier against itself:
 *
 *   $canonical = '{"check_after":43200,"expires_at":null,"grace_period_days":7,
 *                  "plan":"pro","product":"testproduct","status":"active","valid":true}';
 *   hash_hmac('sha256', $canonical, pack('H*', $key_hex), false);
 *   => "8044e27a4f83d249ca27d5c3b23f581c0047348befa626ca5625623a4aea97d6" (65 chars -- see below)
 *
 * (That value is 64 hex chars; the trailing "d6" pair is the last byte —
 * counted with strlen() during derivation, not eyeballed, to avoid
 * transcription error.)
 */

namespace WPistic\Sdk\Tests\Security;

use PHPUnit\Framework\TestCase;
use WPistic\Sdk\Security\HmacVerifier;

class HmacVerifierTest extends TestCase {

	private const VERIFICATION_KEY_HEX = '4e3b1c9a7f2d8e6b0a5c3f9d1e7b4a2c8f6d0b3e9a1c7f5d2b8e4a0c6f3d9b17';

	private const PAYLOAD = array(
		'valid'              => true,
		'status'             => 'active',
		'product'            => 'testproduct',
		'plan'               => 'pro',
		'expires_at'         => null,
		'check_after'        => 43200,
		'grace_period_days'  => 7,
	);

	/** Hand-written canonical form (keys sorted alphabetically) — the independent oracle's input. */
	private const EXPECTED_CANONICAL_JSON = '{"check_after":43200,"expires_at":null,"grace_period_days":7,"plan":"pro","product":"testproduct","status":"active","valid":true}';

	/** hash_hmac('sha256', EXPECTED_CANONICAL_JSON, pack('H*', VERIFICATION_KEY_HEX), false) — computed once, independently. */
	private const GOLDEN_SIGNATURE = '8044e27a4f83d249ca27d5c3b23f581c0047348befa626ca5625623a4aea97d6';

	public function test_golden_signature_is_64_hex_chars(): void {
		$this->assertSame( 64, strlen( self::GOLDEN_SIGNATURE ) );
		$this->assertMatchesRegularExpression( '/^[0-9a-f]{64}$/', self::GOLDEN_SIGNATURE );
	}

	/**
	 * Independent oracle: raw hash_hmac() over the hand-written canonical
	 * string reproduces the golden signature. This does not call
	 * HmacVerifier at all — it just pins the golden vector's derivation so
	 * the test data itself is verifiably self-consistent.
	 */
	public function test_golden_vector_oracle_is_self_consistent(): void {
		$binary_key = pack( 'H*', self::VERIFICATION_KEY_HEX );
		$oracle_signature = hash_hmac( 'sha256', self::EXPECTED_CANONICAL_JSON, $binary_key, false );

		$this->assertSame( self::GOLDEN_SIGNATURE, $oracle_signature );
	}

	/**
	 * The class under test, given the payload + golden signature, must
	 * verify — proving HmacVerifier::verify() (and its internal
	 * canonical_json()) produces the same bytes as the independent oracle.
	 */
	public function test_verify_accepts_the_golden_vector(): void {
		$response = self::PAYLOAD;
		$response['signature'] = self::GOLDEN_SIGNATURE;

		$this->assertTrue( HmacVerifier::verify( $response, self::VERIFICATION_KEY_HEX ) );
	}

	/**
	 * Cross-language golden vector: this signature was produced by the
	 * platform's TypeScript implementation (signLicenseResponse in
	 * apps/api/src/utils/crypto.ts — see the matching test "matches the
	 * cross-language golden vector verified by the PHP SDK" in
	 * crypto.test.ts). Verifying it here proves the two implementations are
	 * byte-identical, including null handling and unescaped slashes in URLs.
	 */
	public function test_verify_accepts_the_typescript_generated_vector(): void {
		$response = array(
			'valid'                => true,
			'status'               => 'active',
			'plan'                 => 'professional',
			'product'              => 'insightistic',
			'expires_at'           => '2027-01-01T00:00:00Z',
			'grace_period_ends_at' => null,
			'check_again_after'    => 43200,
			'portal_url'           => 'https://app.wpistic.com/licenses',
			'signature'            => 'a7e17a8766ed9ad2fcef29d183379ed11e393a224421d3470599383cc814b013',
		);

		$this->assertTrue(
			HmacVerifier::verify( $response, '2af17247559acf975100e3e5ea4fbbd5e6a8336bd80ef3e4c7bee351ffa12adb' )
		);
	}

	public function test_verify_rejects_wrong_signature(): void {
		$response = self::PAYLOAD;
		$response['signature'] = str_repeat( 'a', 64 );

		$this->assertFalse( HmacVerifier::verify( $response, self::VERIFICATION_KEY_HEX ) );
	}

	public function test_verify_rejects_when_payload_is_tampered_after_signing(): void {
		$response = self::PAYLOAD;
		$response['signature'] = self::GOLDEN_SIGNATURE;
		$response['plan']      = 'enterprise'; // tamper after the signature was computed

		$this->assertFalse( HmacVerifier::verify( $response, self::VERIFICATION_KEY_HEX ) );
	}

	public function test_verify_rejects_wrong_key(): void {
		$response = self::PAYLOAD;
		$response['signature'] = self::GOLDEN_SIGNATURE;

		$this->assertFalse( HmacVerifier::verify( $response, str_repeat( '0', 64 ) ) );
	}

	public function test_verify_rejects_missing_signature(): void {
		$this->assertFalse( HmacVerifier::verify( self::PAYLOAD, self::VERIFICATION_KEY_HEX ) );
	}

	public function test_verify_rejects_empty_key(): void {
		$response = self::PAYLOAD;
		$response['signature'] = self::GOLDEN_SIGNATURE;

		$this->assertFalse( HmacVerifier::verify( $response, '' ) );
	}

	public function test_verify_is_case_insensitive_on_signature_hex(): void {
		$response = self::PAYLOAD;
		$response['signature'] = strtoupper( self::GOLDEN_SIGNATURE );

		$this->assertTrue( HmacVerifier::verify( $response, self::VERIFICATION_KEY_HEX ) );
	}

	public function test_verify_rejects_malformed_key_hex(): void {
		$response = self::PAYLOAD;
		$response['signature'] = self::GOLDEN_SIGNATURE;

		$this->assertFalse( HmacVerifier::verify( $response, 'not-hex!!' ) );
		$this->assertFalse( HmacVerifier::verify( $response, 'abc' ) ); // odd length
	}

	// -----------------------------------------------------------------------
	// canonical_json() structural checks (independent of the HMAC oracle —
	// these assert against hand-written literals, not against the class's
	// own prior output).
	// -----------------------------------------------------------------------

	public function test_canonical_json_matches_hand_written_form(): void {
		$this->assertSame( self::EXPECTED_CANONICAL_JSON, HmacVerifier::canonical_json( self::PAYLOAD ) );
	}

	public function test_canonical_json_sorts_keys_recursively(): void {
		$this->assertSame(
			'{"a":{"c":3,"d":2},"b":1}',
			HmacVerifier::canonical_json( array( 'b' => 1, 'a' => array( 'd' => 2, 'c' => 3 ) ) )
		);
	}

	public function test_canonical_json_is_order_independent(): void {
		$a = HmacVerifier::canonical_json( array( 'a' => 1, 'b' => 2 ) );
		$b = HmacVerifier::canonical_json( array( 'b' => 2, 'a' => 1 ) );
		$this->assertSame( $a, $b );
	}

	public function test_canonical_json_preserves_array_order(): void {
		$this->assertSame( '[3,1,2]', HmacVerifier::canonical_json( array( 3, 1, 2 ) ) );
	}

	public function test_canonical_json_treats_empty_array_as_empty_object(): void {
		// PHP cannot distinguish {} from [] once decoded via json_decode(...,
		// true); every empty-able field in this response contract (e.g.
		// `entitlements`) is a JSON object server-side, so that is the
		// choice made here — see HmacVerifier::canonical_json().
		$this->assertSame( '{}', HmacVerifier::canonical_json( array() ) );
	}

	public function test_canonical_json_null_and_bool(): void {
		$this->assertSame( 'null', HmacVerifier::canonical_json( null ) );
		$this->assertSame( 'true', HmacVerifier::canonical_json( true ) );
		$this->assertSame( 'false', HmacVerifier::canonical_json( false ) );
	}
}
