<?php
/**
 * Tests for WPistic\Core\REST\ProductsController.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\REST\ProductsController;
use WPistic\Core\Tests\Support\TestServices;
use WP_REST_Request;

final class ProductsControllerTest extends TestCase {

	private ProductsController $controller;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		$this->controller = new ProductsController( TestServices::container() );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_returns_the_default_catalogue_when_unfiltered(): void {
		Functions\when( 'apply_filters' )->returnArg( 2 );

		$response = $this->controller->get_products( new WP_REST_Request() );

		$products = $response->get_data()['products'];
		$this->assertSame( 200, $response->get_status() );
		$this->assertGreaterThanOrEqual( 10, count( $products ) );
		$this->assertContains( 'chatbotistic', array_column( $products, 'id' ) );
	}

	public function test_applies_the_wpistic_products_catalogue_filter(): void {
		Functions\when( 'apply_filters' )->alias(
			static function ( $tag, $default ) {
				if ( 'wpistic/products/catalogue' === $tag ) {
					return array( array( 'id' => 'custom-product', 'name' => 'Custom' ) );
				}
				return $default;
			}
		);

		$response = $this->controller->get_products( new WP_REST_Request() );

		$this->assertSame(
			array( array( 'id' => 'custom-product', 'name' => 'Custom' ) ),
			$response->get_data()['products']
		);
	}

	public function test_reindexes_products_after_filtering_with_string_keys(): void {
		Functions\when( 'apply_filters' )->alias(
			static function ( $tag, $default ) {
				if ( 'wpistic/products/catalogue' === $tag ) {
					return array( 'chatbotistic' => array( 'id' => 'chatbotistic' ) );
				}
				return $default;
			}
		);

		$response = $this->controller->get_products( new WP_REST_Request() );

		$this->assertSame( array( 0 ), array_keys( $response->get_data()['products'] ) );
	}
}
