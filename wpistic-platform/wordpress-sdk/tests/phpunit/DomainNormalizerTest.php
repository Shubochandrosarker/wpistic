<?php
/**
 * DomainNormalizer parity tests — mirrors apps/api/src/utils/domain.test.ts
 * case-for-case plus additional coverage (IPv4, IDN-ish input, combinations)
 * per the Phase 4 SDK task's 50+-case requirement.
 */

namespace WPistic\Sdk\Tests;

use PHPUnit\Framework\TestCase;
use WPistic\Sdk\DomainNormalizer;

class DomainNormalizerTest extends TestCase {

	/**
	 * @dataProvider normalize_cases
	 */
	public function test_normalize( string $input, string $expected ): void {
		$this->assertSame( $expected, DomainNormalizer::normalize( $input ), "normalize('$input')" );
	}

	/**
	 * @return array<int,array{0:string,1:string}>
	 */
	public static function normalize_cases(): array {
		return array(
			// -- bare domains --------------------------------------------------
			array( 'example.com', 'example.com' ),
			array( 'sub.example.com', 'sub.example.com' ),
			array( 'a.b.c.example.com', 'a.b.c.example.com' ),
			array( 'example.co.uk', 'example.co.uk' ),

			// -- case ------------------------------------------------------------
			array( 'EXAMPLE.COM', 'example.com' ),
			array( 'Example.Com', 'example.com' ),
			array( 'ExAmPlE.CoM', 'example.com' ),

			// -- protocol ---------------------------------------------------------
			array( 'https://example.com', 'example.com' ),
			array( 'http://example.com', 'example.com' ),
			array( 'HTTP://example.com', 'example.com' ),
			array( 'HTTPS://EXAMPLE.COM', 'example.com' ),
			array( 'Http://Example.Com', 'example.com' ),
			array( 'ftp://example.com', 'example.com' ),

			// -- trailing slash / path --------------------------------------------
			array( 'example.com/', 'example.com' ),
			array( 'example.com///', 'example.com' ),
			array( 'example.com/path', 'example.com' ),
			array( 'example.com/path/to/page', 'example.com' ),
			array( 'https://example.com/path', 'example.com' ),

			// -- query / fragment --------------------------------------------------
			array( 'example.com?foo=bar', 'example.com' ),
			array( 'example.com#section', 'example.com' ),
			array( 'example.com/path?foo=bar#section', 'example.com' ),
			array( 'example.com?foo=bar#section', 'example.com' ),
			array( 'example.com#section?foo=bar', 'example.com' ),

			// -- credentials -------------------------------------------------------
			array( 'user@example.com', 'example.com' ),
			array( 'user:pass@example.com', 'example.com' ),
			array( 'https://user:pass@example.com', 'example.com' ),
			array( 'https://user:pass@example.com/path', 'example.com' ),

			// -- www ----------------------------------------------------------------
			array( 'www.example.com', 'example.com' ),
			array( 'WWW.EXAMPLE.COM', 'example.com' ),
			array( 'www.www.example.com', 'www.example.com' ),
			array( 'www.sub.example.com', 'sub.example.com' ),

			// -- ports ----------------------------------------------------------------
			array( 'example.com:8080', 'example.com' ),
			array( 'example.com:443', 'example.com' ),
			array( 'example.com:80', 'example.com' ),
			array( 'example.com:3000', 'example.com' ),
			array( 'https://example.com:8080/path', 'example.com' ),
			array( 'example.com:8080/path?x=1', 'example.com' ),

			// -- trailing dots ----------------------------------------------------------
			array( 'example.com.', 'example.com' ),
			array( 'example.com..', 'example.com' ),
			array( 'example.com...', 'example.com' ),

			// -- whitespace ----------------------------------------------------------------
			array( '  example.com  ', 'example.com' ),
			array( "\texample.com\n", 'example.com' ),

			// -- combinations ----------------------------------------------------------------
			array( 'HTTP://WWW.EXAMPLE.COM/', 'example.com' ),
			array( 'https://staging.example.com:8080/path', 'staging.example.com' ),
			array( '  HTTPS://User:Pass@WWW.Example.COM:8080/a/b?x=1#y  ', 'example.com' ),
			array( 'https://www.example.com:443/path/?q=1#frag', 'example.com' ),
			array( 'HTTP://user@WWW.STAGING.EXAMPLE.COM.:3000/', 'staging.example.com' ),

			// -- localhost / IPv4 ----------------------------------------------------------------
			array( 'localhost', 'localhost' ),
			array( 'localhost:3000', 'localhost' ),
			array( 'LOCALHOST', 'localhost' ),
			array( '127.0.0.1', '127.0.0.1' ),
			array( '127.0.0.1:8080', '127.0.0.1' ),
			array( '192.168.1.100', '192.168.1.100' ),
			array( '192.168.1.100:8080', '192.168.1.100' ),
			array( '10.0.0.5', '10.0.0.5' ),
			array( 'http://127.0.0.1:8080/', '127.0.0.1' ),

			// -- local/test/localhost suffixes ----------------------------------------------------------------
			array( 'mysite.local', 'mysite.local' ),
			array( 'mysite.test', 'mysite.test' ),
			array( 'mysite.localhost', 'mysite.localhost' ),
			array( 'MySite.Local', 'mysite.local' ),

			// -- staging-ish hosts (normalize doesn't classify, just passes through) ---------------
			array( 'staging.example.com', 'staging.example.com' ),
			array( 'stage.example.com', 'stage.example.com' ),
			array( 'dev.example.com', 'dev.example.com' ),
			array( 'example.wpengine.com', 'example.wpengine.com' ),
			array( 'example.kinsta.cloud', 'example.kinsta.cloud' ),
			array( 'example.pantheonsite.io', 'example.pantheonsite.io' ),
			array( 'www.staging.example.com', 'staging.example.com' ),

			// -- edge cases around the www-length guard ("www." itself, and length <= 8) ----------
			array( 'www.', 'www' ),        // trailing dot stripped first -> "www" (len 3), no "www." prefix left to strip
			array( 'www.ab.c', 'www.ab.c' ), // exactly 8 chars -> guard ("> 8") blocks stripping -> unchanged
			array( 'www.abcd.e', 'abcd.e' ), // 10 chars -> guard allows stripping -> "abcd.e"

			// -- Unicode / IDN-ish (no punycode conversion required, just must not crash) -----------
			array( 'exämple.com', 'exämple.com' ),
			array( 'ÉXAMPLE.COM', 'éxample.com' ),
			array( 'ЕХАМPLE.com', 'ехамple.com' ),
			array( 'https://www.münchen.de/', 'münchen.de' ),
			array( 'MÜNCHEN.DE', 'münchen.de' ),
			array( '例え.テスト', '例え.テスト' ),
			array( "\u{00E9}xample.com", 'éxample.com' ),
		);
	}

	/**
	 * www.length guard: "www." itself (4 chars) or anything <= 8 chars total
	 * must never be stripped down to "" — verified explicitly since it is
	 * the one branch with an off-by-one risk.
	 */
	public function test_www_guard_never_empties_the_domain(): void {
		$this->assertSame( '', DomainNormalizer::normalize( '' ) );
		$this->assertNotSame( '', DomainNormalizer::normalize( 'www.ab' ) );
		// "www.ab" is 6 chars (<= 8) -> guard blocks stripping -> stays "www.ab".
		$this->assertSame( 'www.ab', DomainNormalizer::normalize( 'www.ab' ) );
		// "www.abcde" is 9 chars (> 8) -> guard allows stripping -> "abcde".
		$this->assertSame( 'abcde', DomainNormalizer::normalize( 'www.abcde' ) );
	}

	public function test_normalize_never_throws_on_empty_or_garbage_input(): void {
		$this->assertSame( '', DomainNormalizer::normalize( '' ) );
		$this->assertSame( '', DomainNormalizer::normalize( '   ' ) );
		$this->assertIsString( DomainNormalizer::normalize( '////???###' ) );
		$this->assertIsString( DomainNormalizer::normalize( "\xFF\xFE not valid utf-8" ) );
	}

	// ---------------------------------------------------------------------
	// Environment detection
	// ---------------------------------------------------------------------

	/**
	 * @dataProvider environment_cases
	 */
	public function test_detect_environment( string $domain, string $reported, string $expected ): void {
		$this->assertSame( $expected, DomainNormalizer::detect_environment( $domain, $reported ) );
	}

	/**
	 * @return array<int,array{0:string,1:string,2:string}>
	 */
	public static function environment_cases(): array {
		return array(
			array( 'localhost', 'production', 'local' ),
			array( '127.0.0.1', 'production', 'local' ),
			array( 'mysite.local', 'production', 'local' ),
			array( 'mysite.test', 'production', 'local' ),
			array( 'mysite.localhost', 'production', 'local' ),
			array( '10.0.0.5', 'production', 'local' ),
			array( '192.168.1.5', 'production', 'local' ),
			array( 'localhost', 'development', 'local' ), // local pattern always wins

			array( 'staging.example.com', 'production', 'staging' ),
			array( 'stage.example.com', 'production', 'staging' ),
			array( 'dev.example.com', 'production', 'staging' ),
			array( 'example.staging.example.com', 'production', 'staging' ),
			array( 'example.wpengine.com', 'production', 'staging' ),
			array( 'example.kinsta.cloud', 'production', 'staging' ),
			array( 'example.pantheonsite.io', 'production', 'staging' ),

			array( 'example.com', 'production', 'production' ),
			array( 'app.example.com', 'production', 'production' ),

			array( 'example.com', 'development', 'development' ), // reported wins over nothing-detected
			array( 'example.com', 'staging', 'staging' ),
		);
	}
}
