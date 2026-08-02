<?php
/**
 * In-memory ApiClientInterface test double — no network, no WordPress HTTP
 * API. Queue a response per path (or override per-call), and inspect every
 * call made via calls().
 */

namespace WPistic\Sdk\Tests\Fakes;

use WP_Error;
use WPistic\Sdk\Api\ApiClientInterface;

class FakeApiClient implements ApiClientInterface {

	/** @var array<string,array<string,mixed>|WP_Error> */
	private $responses = array();

	/** @var array<int,array{method:string,path:string,body:array<string,mixed>,headers:array<string,string>}> */
	private $calls = array();

	/**
	 * @param array<string,mixed>|WP_Error $response
	 */
	public function queue_response( string $path, $response ): void {
		$this->responses[ $path ] = $response;
	}

	public function post( string $path, array $body = array(), array $headers = array() ) {
		$this->calls[] = array( 'method' => 'POST', 'path' => $path, 'body' => $body, 'headers' => $headers );
		return $this->responses[ $path ] ?? new WP_Error( 'wpistic_test_no_response_queued', "No fake response queued for POST $path" );
	}

	public function get( string $path, array $query = array() ) {
		$this->calls[] = array( 'method' => 'GET', 'path' => $path, 'body' => $query, 'headers' => array() );
		return $this->responses[ $path ] ?? new WP_Error( 'wpistic_test_no_response_queued', "No fake response queued for GET $path" );
	}

	/**
	 * @return array<int,array{method:string,path:string,body:array<string,mixed>,headers:array<string,string>}>
	 */
	public function calls(): array {
		return $this->calls;
	}

	/**
	 * @return array{method:string,path:string,body:array<string,mixed>,headers:array<string,string>}|null
	 */
	public function last_call(): ?array {
		return $this->calls[ count( $this->calls ) - 1 ] ?? null;
	}

	public function call_count(): int {
		return count( $this->calls );
	}
}
