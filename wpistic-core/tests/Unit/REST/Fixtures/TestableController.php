<?php
/**
 * Concrete AbstractController subclass that exposes its protected helpers
 * so unit tests can exercise them directly.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST\Fixtures;

use WPistic\Core\REST\AbstractController;
use WP_REST_Request;

final class TestableController extends AbstractController {

	public function register_routes(): void {}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return true|\WP_Error
	 */
	public function verify_nonce_public( WP_REST_Request $request ) {
		return $this->verify_nonce( $request );
	}

	/**
	 * @param string $bucket Bucket name.
	 * @param int    $limit  Hits allowed.
	 * @param int    $window Window seconds.
	 * @return true|\WP_Error
	 */
	public function rate_limit_public( string $bucket, int $limit, int $window ) {
		return $this->rate_limit( $bucket, $limit, $window );
	}

	/**
	 * @param string $capability Capability slug.
	 */
	public function require_capability_public( string $capability ): callable {
		return $this->require_capability( $capability );
	}
}
