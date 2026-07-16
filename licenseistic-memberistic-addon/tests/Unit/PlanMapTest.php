<?php
/**
 * Tests for WPistic\Bridge\PlanMap.
 *
 * @package WPistic\Bridge
 */

namespace WPistic\Bridge\Tests\Unit;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Bridge\PlanMap;

final class PlanMapTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_for_plan_returns_the_known_pro_entitlements(): void {
		Functions\when( 'apply_filters' )->returnArg( 2 );

		$pro = PlanMap::for_plan( 'pro' );

		$this->assertSame(
			array( 'chatbotistic', 'memberistic', 'bookingistic', 'insightistic', 'crmistic' ),
			$pro['products']
		);
		$this->assertSame( 3, $pro['domain_limit'] );
		$this->assertSame( 5, $pro['download_limit'] );
		$this->assertSame( 25000, $pro['usage_limit'] );
	}

	public function test_for_plan_falls_back_to_free_for_an_unknown_slug(): void {
		Functions\when( 'apply_filters' )->returnArg( 2 );

		$unknown = PlanMap::for_plan( 'nonexistent-plan' );
		$free    = PlanMap::for_plan( 'free' );

		$this->assertSame( $free, $unknown );
		$this->assertSame( array( 'insightistic' ), $unknown['products'] );
	}

	public function test_for_plan_falls_back_to_free_for_an_empty_slug(): void {
		Functions\when( 'apply_filters' )->returnArg( 2 );

		$this->assertSame( PlanMap::for_plan( 'free' ), PlanMap::for_plan( '' ) );
	}

	public function test_agency_plan_grants_wildcard_product_access_and_unlimited_limits(): void {
		Functions\when( 'apply_filters' )->returnArg( 2 );

		$agency = PlanMap::for_plan( 'agency' );

		$this->assertSame( array( '*' ), $agency['products'] );
		$this->assertSame( 0, $agency['domain_limit'] );
		$this->assertSame( 0, $agency['download_limit'] );
		$this->assertSame( 0, $agency['usage_limit'] );
	}

	public function test_all_applies_the_wpistic_bridge_plan_map_filter_to_add_a_plan(): void {
		Functions\when( 'apply_filters' )->alias(
			static function ( $tag, $value ) {
				if ( 'wpistic_bridge_plan_map' === $tag ) {
					$value['custom'] = array(
						'products'       => array( 'customistic' ),
						'domain_limit'   => 7,
						'download_limit' => 7,
						'usage_limit'    => 7000,
					);
				}
				return $value;
			}
		);

		$custom = PlanMap::for_plan( 'custom' );

		$this->assertSame( array( 'customistic' ), $custom['products'] );
	}

	public function test_a_filter_can_override_a_built_in_plan(): void {
		Functions\when( 'apply_filters' )->alias(
			static function ( $tag, $value ) {
				if ( 'wpistic_bridge_plan_map' === $tag ) {
					$value['free']['domain_limit'] = 2;
				}
				return $value;
			}
		);

		$this->assertSame( 2, PlanMap::for_plan( 'free' )['domain_limit'] );
	}
}
