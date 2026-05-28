<?php
/**
 * Plan → entitlement mapping.
 *
 * @package WPistic\Bridge
 */

namespace WPistic\Bridge;

defined( 'ABSPATH' ) || exit;

/**
 * Declarative map of Memberistic plan slugs to the Licenseistic products,
 * domain limits, and usage limits they unlock.
 *
 * The map is filterable so it can be managed from an admin screen or other
 * plugins without editing code.
 */
class PlanMap {

	/**
	 * Default mapping. Filter via "wpistic_bridge_plan_map".
	 *
	 * @return array<string,array<string,mixed>>
	 */
	public static function all(): array {
		$map = array(
			'free'     => array(
				'products'       => array( 'insightistic' ),
				'domain_limit'   => 1,
				'download_limit' => 1,
				'usage_limit'    => 1000,
			),
			'pro'      => array(
				'products'       => array( 'chatbotistic', 'memberistic', 'bookingistic', 'insightistic', 'crmistic' ),
				'domain_limit'   => 3,
				'download_limit' => 5,
				'usage_limit'    => 25000,
			),
			'business' => array(
				'products'       => array( 'chatbotistic', 'memberistic', 'bookingistic', 'insightistic', 'crmistic', 'postistic', 'wpagentistic', 'licenseistic' ),
				'domain_limit'   => 10,
				'download_limit' => 999,
				'usage_limit'    => 100000,
			),
			'agency'   => array(
				'products'       => array( '*' ),
				'domain_limit'   => 0, // 0 = unlimited.
				'download_limit' => 0,
				'usage_limit'    => 0,
			),
		);

		/**
		 * Filter the plan → entitlement map.
		 *
		 * @param array<string,array<string,mixed>> $map Plan map.
		 */
		return apply_filters( 'wpistic_bridge_plan_map', $map );
	}

	/**
	 * Resolve entitlements for a plan slug. Falls back to "free".
	 *
	 * @param string $plan_slug Plan slug.
	 * @return array<string,mixed>
	 */
	public static function for_plan( string $plan_slug ): array {
		$map = self::all();
		return $map[ $plan_slug ] ?? $map['free'];
	}
}
