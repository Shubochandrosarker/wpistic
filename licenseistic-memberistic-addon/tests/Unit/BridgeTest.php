<?php
/**
 * Tests for WPistic\Bridge\Bridge — the Memberistic → Licenseistic
 * billing/entitlement state machine.
 *
 * @package WPistic\Bridge
 */

namespace WPistic\Bridge\Tests\Unit;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Bridge\Bridge;

final class BridgeTest extends TestCase {

	/**
	 * Every do_action() call made during a test, as [hook, args].
	 *
	 * @var array<int,array{0:string,1:mixed}>
	 */
	private array $dispatched = array();

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->dispatched = array();

		// Approximates core WP sanitize_key(): lowercase, then strip anything
		// outside [a-z0-9_-]. Good enough to exercise Bridge's own casting logic.
		Functions\when( 'sanitize_key' )->alias(
			static fn( $value ) => preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $value ) )
		);

		Functions\when( 'do_action' )->alias(
			function ( $hook, $args = null ) {
				$this->dispatched[] = array( $hook, $args );
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @return array<int,mixed>
	 */
	private function actions_for( string $hook ): array {
		return array_column(
			array_filter( $this->dispatched, static fn( $d ) => $hook === $d[0] ),
			1
		);
	}

	/**
	 * @return array<int,mixed>
	 */
	private function grants(): array {
		return $this->actions_for( 'licenseistic/entitlement/grant' );
	}

	// ── on_activated ─────────────────────────────────────────────

	public function test_on_activated_grants_every_product_mapped_to_the_plan(): void {
		( new Bridge() )->on_activated( 7, 'pro' );

		$products = array_column( $this->grants(), 'product' );

		$this->assertSame(
			array( 'chatbotistic', 'memberistic', 'bookingistic', 'insightistic', 'crmistic' ),
			$products
		);
		foreach ( $this->grants() as $grant ) {
			$this->assertSame( 7, $grant['user_id'] );
			$this->assertSame( 'pro', $grant['plan'] );
			$this->assertSame( 'subscription_activated', $grant['reason'] );
			$this->assertSame( 3, $grant['domain_limit'] );
		}
	}

	public function test_on_activated_falls_back_to_free_entitlements_for_an_unknown_plan(): void {
		( new Bridge() )->on_activated( 7, 'made-up-plan' );

		$this->assertSame( array( 'insightistic' ), array_column( $this->grants(), 'product' ) );
	}

	public function test_on_activated_casts_the_user_id_to_an_integer(): void {
		( new Bridge() )->on_activated( '7', 'free' );

		$this->assertSame( 7, $this->grants()[0]['user_id'] );
		$this->assertIsInt( $this->grants()[0]['user_id'] );
	}

	public function test_on_activated_only_dispatches_grant_actions_when_core_is_inactive(): void {
		// WPistic\Core\Plugin genuinely does not exist in this test process,
		// so sync_workspace_plan()/log() must bail silently instead of
		// throwing or dispatching anything unexpected.
		( new Bridge() )->on_activated( 1, 'free' );

		$this->assertSame(
			array( 'licenseistic/entitlement/grant' ),
			array_unique( array_column( $this->dispatched, 0 ) )
		);
	}

	// ── on_renewed ───────────────────────────────────────────────

	public function test_on_renewed_re_grants_the_same_entitlements_as_activation(): void {
		( new Bridge() )->on_renewed( 3, 'business' );

		$this->assertSame(
			array( 'chatbotistic', 'memberistic', 'bookingistic', 'insightistic', 'crmistic', 'postistic', 'wpagentistic', 'licenseistic' ),
			array_column( $this->grants(), 'product' )
		);
	}

	// ── on_cancelled ─────────────────────────────────────────────

	public function test_on_cancelled_suspends_every_product_mapped_to_the_cancelled_plan(): void {
		( new Bridge() )->on_cancelled( 9, 'pro' );

		$suspended = $this->actions_for( 'licenseistic/entitlement/suspend' );

		$this->assertSame(
			array( 'chatbotistic', 'memberistic', 'bookingistic', 'insightistic', 'crmistic' ),
			array_column( $suspended, 'product' )
		);
		foreach ( $suspended as $suspend ) {
			$this->assertSame( 'subscription_cancelled', $suspend['reason'] );
		}
	}

	public function test_on_cancelled_never_suspends_the_wildcard_product(): void {
		( new Bridge() )->on_cancelled( 9, 'agency' );

		$this->assertSame( array(), $this->actions_for( 'licenseistic/entitlement/suspend' ) );
	}

	// ── on_payment_failed ────────────────────────────────────────

	public function test_on_payment_failed_suspends_licenses_with_the_payment_failed_reason(): void {
		( new Bridge() )->on_payment_failed( 4, 'pro' );

		$reasons = array_column( $this->actions_for( 'licenseistic/entitlement/suspend' ), 'reason' );

		$this->assertNotEmpty( $reasons );
		foreach ( $reasons as $reason ) {
			$this->assertSame( 'payment_failed', $reason );
		}
	}

	// ── on_plan_changed ──────────────────────────────────────────

	public function test_on_plan_changed_revokes_products_dropped_by_a_downgrade(): void {
		( new Bridge() )->on_plan_changed( 11, 'business', 'free' );

		$revoked = $this->actions_for( 'licenseistic/entitlement/revoke' );

		// business has 8 products, free keeps only "insightistic" — every other
		// business product should be revoked, in their original order.
		$this->assertSame(
			array( 'chatbotistic', 'memberistic', 'bookingistic', 'crmistic', 'postistic', 'wpagentistic', 'licenseistic' ),
			array_column( $revoked, 'product' )
		);
		foreach ( $revoked as $revoke ) {
			$this->assertSame( 'plan_downgrade', $revoke['reason'] );
		}
	}

	public function test_on_plan_changed_grants_new_products_added_by_an_upgrade_without_revoking(): void {
		( new Bridge() )->on_plan_changed( 11, 'free', 'pro' );

		$this->assertSame(
			array( 'chatbotistic', 'memberistic', 'bookingistic', 'insightistic', 'crmistic' ),
			array_column( $this->grants(), 'product' )
		);
		$this->assertSame( array(), $this->actions_for( 'licenseistic/entitlement/revoke' ) );
	}

	public function test_on_plan_changed_to_agency_short_circuits_revocation_via_the_wildcard(): void {
		( new Bridge() )->on_plan_changed( 11, 'pro', 'agency' );

		$this->assertSame( array(), $this->actions_for( 'licenseistic/entitlement/revoke' ) );
	}

	public function test_on_plan_changed_updates_limits_to_the_new_plans_values(): void {
		( new Bridge() )->on_plan_changed( 11, 'free', 'business' );

		$limit_updates = $this->actions_for( 'licenseistic/entitlement/update_limits' );

		$this->assertCount( 1, $limit_updates );
		$this->assertSame( 10, $limit_updates[0]['domain_limit'] );
		$this->assertSame( 999, $limit_updates[0]['download_limit'] );
		$this->assertSame( 100000, $limit_updates[0]['usage_limit'] );
	}

	// ── register ─────────────────────────────────────────────────

	public function test_register_wires_every_memberistic_lifecycle_hook_with_the_right_arg_counts(): void {
		$added = array();
		Functions\when( 'add_action' )->alias(
			static function ( $hook, $callback, $priority = 10, $accepted_args = 1 ) use ( &$added ) {
				$added[ $hook ] = array( $priority, $accepted_args );
			}
		);

		( new Bridge() )->register();

		$this->assertSame( array( 10, 2 ), $added['memberistic_subscription_activated'] );
		$this->assertSame( array( 10, 2 ), $added['memberistic_subscription_renewed'] );
		$this->assertSame( array( 10, 2 ), $added['memberistic_subscription_cancelled'] );
		$this->assertSame( array( 10, 2 ), $added['memberistic_payment_failed'] );
		$this->assertSame( array( 10, 3 ), $added['memberistic_plan_changed'] );
	}
}
