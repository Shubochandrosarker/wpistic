<?php
/**
 * Tests for WPistic\Core\Services\ActivityService.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\Services;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\Services\ActivityService;
use WPistic\Core\Tests\Support\FakeWpdb;

final class ActivityServiceTest extends TestCase {

	private FakeWpdb $wpdb;

	private ActivityService $service;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		global $wpdb;
		$wpdb       = new FakeWpdb();
		$this->wpdb = $wpdb;

		$counter = 0;
		Functions\when( 'current_time' )->alias(
			static function () use ( &$counter ) {
				++$counter;
				return sprintf( '2026-01-01 00:00:%02d', $counter );
			}
		);
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'sanitize_key' )->alias( static fn( $v ) => strtolower( (string) $v ) );
		Functions\when( 'wp_json_encode' )->alias( static fn( $v ) => json_encode( $v ) );

		$this->service = new ActivityService();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_record_then_recent_round_trips_an_event(): void {
		$this->service->record( 1, 'website_connected', array( 'message' => 'Connected example.com' ) );

		$events = $this->service->recent( 1 );

		$this->assertCount( 1, $events );
		$this->assertSame( 'website_connected', $events[0]['event_type'] );
		$this->assertSame( 'Connected example.com', $events[0]['message'] );
	}

	public function test_recent_only_returns_events_for_the_given_workspace(): void {
		$this->service->record( 1, 'a' );
		$this->service->record( 2, 'b' );

		$events = $this->service->recent( 1 );

		$this->assertCount( 1, $events );
		$this->assertSame( 'a', $events[0]['event_type'] );
	}

	public function test_recent_orders_newest_first(): void {
		$this->service->record( 1, 'first' );
		$this->service->record( 1, 'second' );

		$events = $this->service->recent( 1 );

		$this->assertSame( 'second', $events[0]['event_type'] );
		$this->assertSame( 'first', $events[1]['event_type'] );
	}

	/**
	 * `max( 1, min( 100, $limit ) )` — boundary values the coverage report
	 * flagged as untested.
	 */
	public function test_recent_clamps_a_limit_above_the_ceiling_to_100(): void {
		for ( $i = 0; $i < 105; $i++ ) {
			$this->service->record( 1, "event-{$i}" );
		}

		$this->assertCount( 100, $this->service->recent( 1, 999 ) );
	}

	public function test_recent_clamps_a_zero_limit_up_to_one(): void {
		$this->service->record( 1, 'first' );
		$this->service->record( 1, 'second' );

		$this->assertCount( 1, $this->service->recent( 1, 0 ) );
	}

	public function test_recent_clamps_a_negative_limit_up_to_one(): void {
		$this->service->record( 1, 'first' );
		$this->service->record( 1, 'second' );

		$this->assertCount( 1, $this->service->recent( 1, -5 ) );
	}

	public function test_recent_returns_an_empty_array_for_a_workspace_with_no_activity(): void {
		$this->assertSame( array(), $this->service->recent( 999 ) );
	}
}
