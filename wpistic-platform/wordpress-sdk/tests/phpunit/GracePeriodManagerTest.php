<?php
/**
 * GracePeriodManager: offline-resilience math. `now` is always injected —
 * never wall-clock time() — so these boundary cases are exact and stable.
 *
 * Formula under test (mirrors the pre-extraction inline logic byte for
 * byte): grace does not start until `check_after * 2` seconds after the
 * last successful validation; from there, `grace_period_days` more days
 * of active-ness are granted.
 */

namespace WPistic\Sdk\Tests;

use PHPUnit\Framework\TestCase;
use WPistic\Sdk\GracePeriodManager;

class GracePeriodManagerTest extends TestCase {

	private const VALIDATED_AT = 1_700_000_000;

	private function manager(): GracePeriodManager {
		return new GracePeriodManager();
	}

	/**
	 * check_after = 0 puts the start of the grace window at t=validated_at
	 * exactly, so "day N" of the grace period lines up with N * DAY_IN_SECONDS
	 * of elapsed time — the clearest way to test the day-6/7/8 boundary the
	 * task calls out explicitly.
	 */
	private function response_zero_check_after( int $grace_days = 7 ): array {
		return array(
			'valid'             => true,
			'check_after'       => 0,
			'grace_period_days' => $grace_days,
		);
	}

	public function test_day_6_of_7_is_still_active(): void {
		$manager = $this->manager();
		$now     = self::VALIDATED_AT + ( 6 * DAY_IN_SECONDS );

		$this->assertTrue( $manager->is_active( $this->response_zero_check_after( 7 ), self::VALIDATED_AT, $now ) );
	}

	public function test_exactly_the_day_7_boundary_is_still_active(): void {
		$manager = $this->manager();
		$now     = self::VALIDATED_AT + ( 7 * DAY_IN_SECONDS );

		$this->assertTrue( $manager->is_active( $this->response_zero_check_after( 7 ), self::VALIDATED_AT, $now ) );
	}

	public function test_one_second_past_the_day_7_boundary_is_inactive(): void {
		$manager = $this->manager();
		$now     = self::VALIDATED_AT + ( 7 * DAY_IN_SECONDS ) + 1;

		$this->assertFalse( $manager->is_active( $this->response_zero_check_after( 7 ), self::VALIDATED_AT, $now ) );
	}

	public function test_day_8_is_inactive(): void {
		$manager = $this->manager();
		$now     = self::VALIDATED_AT + ( 8 * DAY_IN_SECONDS );

		$this->assertFalse( $manager->is_active( $this->response_zero_check_after( 7 ), self::VALIDATED_AT, $now ) );
	}

	public function test_day_0_is_active(): void {
		$manager = $this->manager();
		$this->assertTrue( $manager->is_active( $this->response_zero_check_after( 7 ), self::VALIDATED_AT, self::VALIDATED_AT ) );
	}

	/**
	 * Realistic values: check_after = 43200s (12h) — grace does not begin
	 * until the check window has silently doubled to 24h with no successful
	 * revalidation, then 7 more days are granted, so the *total* active
	 * window from validated_at is 8 days, not 7.
	 */
	public function test_realistic_check_after_delays_the_grace_start(): void {
		$manager  = $this->manager();
		$response = array( 'valid' => true, 'check_after' => 43200, 'grace_period_days' => 7 );

		// 12h in: still within the normal check_after window, well before grace even starts.
		$this->assertTrue( $manager->is_active( $response, self::VALIDATED_AT, self::VALIDATED_AT + HOUR_IN_SECONDS * 12 ) );

		// Exactly at the grace start (check_after * 2 = 24h): still active.
		$this->assertTrue( $manager->is_active( $response, self::VALIDATED_AT, self::VALIDATED_AT + HOUR_IN_SECONDS * 24 ) );

		// 8 days total from validated_at (24h grace-start + 7 days grace): still active at the exact boundary.
		$boundary = self::VALIDATED_AT + HOUR_IN_SECONDS * 24 + 7 * DAY_IN_SECONDS;
		$this->assertTrue( $manager->is_active( $response, self::VALIDATED_AT, $boundary ) );

		// One second past that: inactive.
		$this->assertFalse( $manager->is_active( $response, self::VALIDATED_AT, $boundary + 1 ) );
	}

	public function test_defaults_are_used_when_response_omits_check_after_and_grace_days(): void {
		$manager  = $this->manager();
		$response = array( 'valid' => true ); // no check_after / grace_period_days

		// Defaults: check_after=43200 (12h), grace_period_days=7 -> 8-day total window.
		$boundary = self::VALIDATED_AT + ( 2 * 43200 ) + ( 7 * DAY_IN_SECONDS );
		$this->assertTrue( $manager->is_active( $response, self::VALIDATED_AT, $boundary ) );
		$this->assertFalse( $manager->is_active( $response, self::VALIDATED_AT, $boundary + 1 ) );
	}

	// -------------------------------------------------------------------------
	// seconds_remaining()
	// -------------------------------------------------------------------------

	public function test_seconds_remaining_is_null_before_grace_starts(): void {
		$manager = $this->manager();
		$this->assertNull( $manager->seconds_remaining( $this->response_zero_check_after( 7 ), self::VALIDATED_AT, self::VALIDATED_AT ) );
	}

	public function test_seconds_remaining_is_null_exactly_at_grace_start(): void {
		$manager  = $this->manager();
		$response = array( 'valid' => true, 'check_after' => 43200, 'grace_period_days' => 7 );
		$grace_start = self::VALIDATED_AT + ( 43200 * 2 );

		$this->assertNull( $manager->seconds_remaining( $response, self::VALIDATED_AT, $grace_start ) );
	}

	public function test_seconds_remaining_counts_down_through_day_6_7_8(): void {
		$manager = $this->manager();
		$response = $this->response_zero_check_after( 7 );

		// Day 6: 1 day of grace left.
		$this->assertSame(
			DAY_IN_SECONDS,
			$manager->seconds_remaining( $response, self::VALIDATED_AT, self::VALIDATED_AT + 6 * DAY_IN_SECONDS )
		);

		// Exactly day 7: 0 seconds left, but still non-null (still "in grace", just about to end).
		$this->assertSame(
			0,
			$manager->seconds_remaining( $response, self::VALIDATED_AT, self::VALIDATED_AT + 7 * DAY_IN_SECONDS )
		);

		// Day 8: grace math floors at 0, never negative.
		$this->assertSame(
			0,
			$manager->seconds_remaining( $response, self::VALIDATED_AT, self::VALIDATED_AT + 8 * DAY_IN_SECONDS )
		);
	}

	public function test_seconds_remaining_never_goes_negative_far_past_expiry(): void {
		$manager = $this->manager();
		$response = $this->response_zero_check_after( 7 );

		$this->assertSame(
			0,
			$manager->seconds_remaining( $response, self::VALIDATED_AT, self::VALIDATED_AT + 365 * DAY_IN_SECONDS )
		);
	}
}
