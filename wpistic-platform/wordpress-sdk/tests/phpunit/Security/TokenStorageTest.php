<?php
/**
 * TokenStorage: AES-256-GCM at-rest encryption for everything the SDK
 * persists to wp_options.
 */

namespace WPistic\Sdk\Tests\Security;

use PHPUnit\Framework\TestCase;
use WPistic\Sdk\Security\TokenStorage;

class TokenStorageTest extends TestCase {

	private function storage(): TokenStorage {
		// Fixed key material so tests are deterministic; production uses wp_salt('auth').
		return new TokenStorage( 'unit-test-key-material-0123456789abcdef' );
	}

	public function test_encrypt_then_decrypt_returns_original_plaintext(): void {
		$storage   = $this->storage();
		$plaintext = wp_json_encode(
			array(
				'activation_token' => 'eyJhbGciOiJSUzI1NiJ9.fake.jwt',
				'verification_key' => str_repeat( 'ab', 32 ),
				'key_mask'         => 'seoistic_****ab12',
			)
		);

		$encrypted = $storage->encrypt( $plaintext );
		$this->assertSame( $plaintext, $storage->decrypt( $encrypted ) );
	}

	public function test_encrypt_then_decrypt_round_trips_empty_string(): void {
		$storage = $this->storage();
		$encrypted = $storage->encrypt( '' );
		$this->assertSame( '', $storage->decrypt( $encrypted ) );
	}

	public function test_encrypt_then_decrypt_round_trips_unicode(): void {
		$storage   = $this->storage();
		$plaintext = '{"note":"café — 日本語"}';
		$encrypted = $storage->encrypt( $plaintext );
		$this->assertSame( $plaintext, $storage->decrypt( $encrypted ) );
	}

	public function test_ciphertext_does_not_contain_the_plaintext(): void {
		$storage   = $this->storage();
		$plaintext = 'super-secret-activation-token-value';
		$encrypted = $storage->encrypt( $plaintext );

		$this->assertStringNotContainsString( $plaintext, $encrypted );
	}

	public function test_two_encryptions_of_the_same_plaintext_differ_but_both_decrypt_correctly(): void {
		$storage   = $this->storage();
		$plaintext = 'identical-plaintext-value';

		$first  = $storage->encrypt( $plaintext );
		$second = $storage->encrypt( $plaintext );

		$this->assertNotSame( $first, $second, 'random per-encryption IV must make ciphertexts differ' );
		$this->assertSame( $plaintext, $storage->decrypt( $first ) );
		$this->assertSame( $plaintext, $storage->decrypt( $second ) );
	}

	public function test_decrypt_returns_null_for_garbage_input_without_fatal_error(): void {
		$storage = $this->storage();

		$this->assertNull( $storage->decrypt( '' ) );
		$this->assertNull( $storage->decrypt( 'not-even-base64-!!!' ) );
		$this->assertNull( $storage->decrypt( base64_encode( 'too short' ) ) );
		$this->assertNull( $storage->decrypt( base64_encode( random_bytes( 8 ) ) ) );
	}

	public function test_decrypt_returns_null_for_tampered_ciphertext(): void {
		$storage   = $this->storage();
		$encrypted = $storage->encrypt( 'value-that-must-stay-authentic' );

		$raw = base64_decode( $encrypted, true );
		// Flip a bit well past the IV+tag header, inside the ciphertext body.
		$raw[ strlen( $raw ) - 1 ] = chr( ~ord( $raw[ strlen( $raw ) - 1 ] ) & 0xff );
		$tampered = base64_encode( $raw );

		$this->assertNull( $storage->decrypt( $tampered ) );
	}

	public function test_decrypt_returns_null_for_tampered_auth_tag(): void {
		$storage   = $this->storage();
		$encrypted = $storage->encrypt( 'value-that-must-stay-authentic' );

		$raw = base64_decode( $encrypted, true );
		// The tag occupies bytes [12, 28) (12-byte IV, 16-byte tag).
		$raw[12] = chr( ~ord( $raw[12] ) & 0xff );
		$tampered = base64_encode( $raw );

		$this->assertNull( $storage->decrypt( $tampered ) );
	}

	public function test_decrypt_returns_null_when_key_material_differs(): void {
		$storage_a = new TokenStorage( 'key-material-a' );
		$storage_b = new TokenStorage( 'key-material-b' );

		$encrypted = $storage_a->encrypt( 'value' );

		$this->assertNull( $storage_b->decrypt( $encrypted ) );
	}

	public function test_default_constructor_uses_wp_salt(): void {
		// wp_salt() is stubbed in bootstrap.php to a fixed value, so this is
		// still deterministic — it exercises the real default code path.
		$storage = new TokenStorage();
		$encrypted = $storage->encrypt( 'value' );
		$this->assertSame( 'value', $storage->decrypt( $encrypted ) );

		$other = new TokenStorage();
		$this->assertSame( 'value', $other->decrypt( $encrypted ), 'same wp_salt() derivation must be stable across instances' );
	}
}
