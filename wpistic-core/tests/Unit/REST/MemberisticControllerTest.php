<?php
/**
 * Tests for WPistic\Core\REST\MemberisticController.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\REST\MemberisticController;
use WPistic\Core\Tests\Support\TestServices;
use WP_REST_Request;

final class MemberisticControllerTest extends TestCase {

	private MemberisticController $controller;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		Functions\when( 'apply_filters' )->returnArg( 2 );
		Functions\when( 'get_current_user_id' )->justReturn( 7 );

		$this->controller = new MemberisticController( TestServices::container() );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_plans_returns_the_fallback_catalogue_when_memberistic_is_absent(): void {
		$response = $this->controller->plans( new WP_REST_Request() );

		$slugs = array_column( $response->get_data()['plans'], 'slug' );
		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( array( 'free', 'pro', 'business' ), $slugs );
	}

	public function test_subscription_returns_the_fallback_free_subscription(): void {
		$response = $this->controller->subscription( new WP_REST_Request() );

		$this->assertSame( 'free', $response->get_data()['subscription']['plan_slug'] );
		$this->assertSame( 'active', $response->get_data()['subscription']['status'] );
	}

	public function test_billing_and_invoices_default_to_empty_when_memberistic_is_absent(): void {
		$billing  = $this->controller->billing( new WP_REST_Request() );
		$invoices = $this->controller->invoices( new WP_REST_Request() );

		$this->assertSame( array(), $billing->get_data()['billing'] );
		$this->assertSame( array(), $invoices->get_data()['invoices'] );
	}
}
