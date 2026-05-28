<?php
/**
 * Bridge — listens to Memberistic events and maps them to Licenseistic.
 *
 * @package WPistic\Bridge
 */

namespace WPistic\Bridge;

defined( 'ABSPATH' ) || exit;

/**
 * Event-driven bridge. Decoupled: it only reacts to Memberistic actions and
 * fires Licenseistic actions. Neither plugin needs to know about the other.
 */
class Bridge {

	/**
	 * Hook into Memberistic lifecycle events.
	 */
	public function register(): void {
		add_action( 'memberistic_subscription_activated', array( $this, 'on_activated' ), 10, 2 );
		add_action( 'memberistic_subscription_renewed', array( $this, 'on_renewed' ), 10, 2 );
		add_action( 'memberistic_subscription_cancelled', array( $this, 'on_cancelled' ), 10, 2 );
		add_action( 'memberistic_payment_failed', array( $this, 'on_payment_failed' ), 10, 2 );
		add_action( 'memberistic_plan_changed', array( $this, 'on_plan_changed' ), 10, 3 );

		do_action( 'wpistic_bridge_registered', $this );
	}

	/**
	 * On activation: grant entitlements for every mapped product.
	 *
	 * @param int    $user_id   Member user id.
	 * @param string $plan_slug Activated plan slug.
	 */
	public function on_activated( $user_id, $plan_slug ): void {
		$user_id   = (int) $user_id;
		$plan_slug = sanitize_key( (string) $plan_slug );
		$ent       = PlanMap::for_plan( $plan_slug );

		foreach ( $ent['products'] as $product ) {
			$this->grant(
				array(
					'user_id'        => $user_id,
					'product'        => $product,
					'plan'           => $plan_slug,
					'domain_limit'   => $ent['domain_limit'],
					'download_limit' => $ent['download_limit'],
					'usage_limit'    => $ent['usage_limit'],
					'reason'         => 'subscription_activated',
				)
			);
		}

		$this->sync_workspace_plan( $user_id, $plan_slug, 'active' );
		$this->log( $user_id, 'bridge_entitlements_granted', "Activated {$plan_slug} → granted entitlements" );
	}

	/**
	 * On renewal: restore any suspended/limited licenses.
	 *
	 * @param int    $user_id   Member user id.
	 * @param string $plan_slug Plan slug.
	 */
	public function on_renewed( $user_id, $plan_slug ): void {
		// Restoring is functionally the same as re-granting access.
		$this->on_activated( $user_id, $plan_slug );
		$this->log( (int) $user_id, 'bridge_licenses_restored', 'Renewal restored license access' );
	}

	/**
	 * On cancellation: suspend related licenses.
	 *
	 * @param int    $user_id   Member user id.
	 * @param string $plan_slug Plan slug being cancelled.
	 */
	public function on_cancelled( $user_id, $plan_slug ): void {
		$this->suspend_plan( (int) $user_id, sanitize_key( (string) $plan_slug ), 'subscription_cancelled' );
		$this->sync_workspace_plan( (int) $user_id, 'free', 'cancelled' );
		$this->log( (int) $user_id, 'bridge_licenses_suspended', 'Cancellation suspended licenses' );
	}

	/**
	 * On payment failure: limit (suspend) licenses pending resolution.
	 *
	 * @param int    $user_id   Member user id.
	 * @param string $plan_slug Plan slug.
	 */
	public function on_payment_failed( $user_id, $plan_slug ): void {
		$this->suspend_plan( (int) $user_id, sanitize_key( (string) $plan_slug ), 'payment_failed' );
		$this->sync_workspace_plan( (int) $user_id, sanitize_key( (string) $plan_slug ), 'past_due' );
		$this->log( (int) $user_id, 'bridge_payment_failed', 'Payment failed — licenses limited' );
	}

	/**
	 * On upgrade/downgrade: re-scope domain limits, product access, usage.
	 *
	 * @param int    $user_id  Member user id.
	 * @param string $from     Previous plan slug.
	 * @param string $to       New plan slug.
	 */
	public function on_plan_changed( $user_id, $from, $to ): void {
		$user_id = (int) $user_id;
		$from    = sanitize_key( (string) $from );
		$to      = sanitize_key( (string) $to );

		$old = PlanMap::for_plan( $from );
		$new = PlanMap::for_plan( $to );

		// Revoke products no longer covered (unless the new plan is "*").
		if ( ! in_array( '*', $new['products'], true ) ) {
			$removed = array_diff( $old['products'], $new['products'] );
			foreach ( $removed as $product ) {
				if ( '*' === $product ) {
					continue;
				}
				$this->revoke(
					array(
						'user_id' => $user_id,
						'product' => $product,
						'reason'  => 'plan_downgrade',
					)
				);
			}
		}

		// Grant + update limits for the new plan.
		$this->on_activated( $user_id, $to );

		$this->update_limits(
			array(
				'user_id'        => $user_id,
				'domain_limit'   => $new['domain_limit'],
				'download_limit' => $new['download_limit'],
				'usage_limit'    => $new['usage_limit'],
			)
		);

		$this->log( $user_id, 'bridge_plan_changed', "Plan changed {$from} → {$to}" );
	}

	// ── Licenseistic emitters ───────────────────────────────────

	/**
	 * Grant an entitlement via the core adapter (preferred) or directly.
	 *
	 * @param array<string,mixed> $args Entitlement args.
	 */
	private function grant( array $args ): void {
		do_action( 'licenseistic/entitlement/grant', $args );
	}

	/**
	 * Revoke an entitlement.
	 *
	 * @param array<string,mixed> $args Entitlement args.
	 */
	private function revoke( array $args ): void {
		do_action( 'licenseistic/entitlement/revoke', $args );
	}

	/**
	 * Update usage/domain limits.
	 *
	 * @param array<string,mixed> $args Limit args.
	 */
	private function update_limits( array $args ): void {
		do_action( 'licenseistic/entitlement/update_limits', $args );
	}

	/**
	 * Suspend every product mapped to a plan.
	 *
	 * @param int    $user_id   Member user id.
	 * @param string $plan_slug Plan slug.
	 * @param string $reason    Suspension reason.
	 */
	private function suspend_plan( int $user_id, string $plan_slug, string $reason ): void {
		$ent = PlanMap::for_plan( $plan_slug );
		foreach ( $ent['products'] as $product ) {
			if ( '*' === $product ) {
				continue;
			}
			do_action(
				'licenseistic/entitlement/suspend',
				array(
					'user_id' => $user_id,
					'product' => $product,
					'reason'  => $reason,
				)
			);
		}
	}

	/**
	 * Keep the WPistic workspace plan in sync (if WPistic Core is active).
	 *
	 * @param int    $user_id   Member user id.
	 * @param string $plan_slug Plan slug.
	 * @param string $status    Plan status.
	 */
	private function sync_workspace_plan( int $user_id, string $plan_slug, string $status ): void {
		if ( ! class_exists( '\\WPistic\\Core\\Plugin' ) ) {
			return;
		}
		try {
			$service = \WPistic\Core\Plugin::instance()->service( \WPistic\Core\Services\WorkspaceService::class );
			$service->set_plan( $user_id, $plan_slug, $status );
		} catch ( \Throwable $e ) {
			// Core not fully booted; ignore.
			unset( $e );
		}
	}

	/**
	 * Write an activity record when WPistic Core is present.
	 *
	 * @param int    $user_id Member user id.
	 * @param string $event   Event type.
	 * @param string $message Human message.
	 */
	private function log( int $user_id, string $event, string $message ): void {
		if ( ! class_exists( '\\WPistic\\Core\\Plugin' ) ) {
			return;
		}
		try {
			$plugin    = \WPistic\Core\Plugin::instance();
			$workspace = $plugin->service( \WPistic\Core\Services\WorkspaceService::class )->get_for_user( $user_id );
			if ( $workspace ) {
				$plugin->service( \WPistic\Core\Services\ActivityService::class )->record(
					$workspace['id'],
					$event,
					array(
						'user_id' => $user_id,
						'message' => $message,
					)
				);
			}
		} catch ( \Throwable $e ) {
			unset( $e );
		}
	}
}
