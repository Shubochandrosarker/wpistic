<?php
/**
 * Memberistic adapter — memberships, subscriptions, billing, invoices.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Integrations;

defined( 'ABSPATH' ) || exit;

/**
 * Talks to the Memberistic plugin through a stable, filter-based contract.
 *
 * Memberistic is expected to expose (when active):
 *   - function memberistic() or class \Memberistic\Plugin
 *   - filter  memberistic/api/plans
 *   - filter  memberistic/api/subscription   ( $default, int $user_id )
 *   - filter  memberistic/api/billing        ( $default, int $user_id )
 *   - filter  memberistic/api/invoices        ( $default, int $user_id )
 */
class MemberisticAdapter extends AbstractAdapter {

	public function slug(): string {
		return 'memberistic';
	}

	public function is_available(): bool {
		return function_exists( 'memberistic' )
			|| class_exists( '\\Memberistic\\Plugin' )
			|| defined( 'MEMBERISTIC_VERSION' );
	}

	/**
	 * Available membership plans.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public function get_plans(): array {
		return (array) $this->filtered( 'memberistic/api/plans', $this->fallback_plans() );
	}

	/**
	 * The current subscription for a user.
	 *
	 * @param int $user_id WordPress user id.
	 * @return array<string,mixed>
	 */
	public function get_subscription( int $user_id ): array {
		return (array) $this->filtered(
			'memberistic/api/subscription',
			$this->fallback_subscription(),
			$user_id
		);
	}

	/**
	 * Billing summary (payment method, next renewal, balance).
	 *
	 * @param int $user_id WordPress user id.
	 * @return array<string,mixed>
	 */
	public function get_billing( int $user_id ): array {
		return (array) $this->filtered( 'memberistic/api/billing', array(), $user_id );
	}

	/**
	 * Invoice history.
	 *
	 * @param int $user_id WordPress user id.
	 * @return array<int,array<string,mixed>>
	 */
	public function get_invoices( int $user_id ): array {
		return (array) $this->filtered( 'memberistic/api/invoices', array(), $user_id );
	}

	/**
	 * Resolve the active plan slug + status for a user, used for dashboard boot.
	 *
	 * @param int $user_id WordPress user id.
	 * @return array{slug:string,name:string,status:string}
	 */
	public function resolve_plan( int $user_id ): array {
		$sub = $this->get_subscription( $user_id );
		return array(
			'slug'   => (string) ( $sub['plan_slug'] ?? 'free' ),
			'name'   => (string) ( $sub['plan_name'] ?? 'Free' ),
			'status' => (string) ( $sub['status'] ?? 'inactive' ),
		);
	}

	/**
	 * Fallback plan catalogue when Memberistic is not installed.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private function fallback_plans(): array {
		return array(
			array(
				'slug'     => 'free',
				'name'     => 'Free',
				'price'    => 0,
				'interval' => 'month',
				'features' => array( '1 website', 'Community support' ),
			),
			array(
				'slug'     => 'pro',
				'name'     => 'Pro',
				'price'    => 29,
				'interval' => 'month',
				'features' => array( '3 websites', 'All plugins', 'Email support' ),
			),
			array(
				'slug'     => 'business',
				'name'     => 'Business',
				'price'    => 79,
				'interval' => 'month',
				'features' => array( '10 websites', 'AI agents', 'Priority support' ),
			),
		);
	}

	/**
	 * Fallback subscription shape.
	 *
	 * @return array<string,mixed>
	 */
	private function fallback_subscription(): array {
		return array(
			'plan_slug' => 'free',
			'plan_name' => 'Free',
			'status'    => 'active',
			'renews_at' => null,
			'trial_end' => null,
		);
	}
}
