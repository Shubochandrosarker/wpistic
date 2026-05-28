<?php
/**
 * /wpistic/v1/products controller.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * The WordPressistic product catalogue. Filterable so other plugins can
 * extend it; ships with the canonical ecosystem list as a default.
 */
class ProductsController extends AbstractController {

	/**
	 * Register routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/products',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'get_products' ),
				'permission_callback' => array( $this, 'require_dashboard_access' ),
			)
		);
	}

	/**
	 * GET /products.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function get_products( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		/**
		 * Filter the product catalogue.
		 *
		 * @param array<int,array<string,mixed>> $products Default catalogue.
		 */
		$products = apply_filters( 'wpistic/products/catalogue', $this->catalogue() );
		return new WP_REST_Response( array( 'products' => array_values( $products ) ), 200 );
	}

	/**
	 * Canonical WordPressistic catalogue (mirrors the approved UI data).
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private function catalogue(): array {
		return array(
			array(
				'id'       => 'chatbotistic',
				'name'     => 'Chatbotistic',
				'category' => 'AI & Automation',
				'tagline'  => 'AI WhatsApp + website chatbot',
				'status'   => 'Live',
				'flagship' => true,
			),
			array(
				'id'       => 'memberistic',
				'name'     => 'Memberistic',
				'category' => 'Business Tools',
				'tagline'  => 'Memberships & subscriptions',
				'status'   => 'Live',
			),
			array(
				'id'       => 'bookingistic',
				'name'     => 'Bookingistic',
				'category' => 'Business Tools',
				'tagline'  => 'Booking & appointments',
				'status'   => 'Live',
			),
			array(
				'id'       => 'insightistic',
				'name'     => 'Insightistic',
				'category' => 'Analytics',
				'tagline'  => 'Unified analytics dashboard',
				'status'   => 'Live',
			),
			array(
				'id'       => 'wpagentistic',
				'name'     => 'WPAgentistic',
				'category' => 'AI & Automation',
				'tagline'  => 'AI agent marketplace',
				'status'   => 'Beta',
			),
			array(
				'id'       => 'postistic',
				'name'     => 'Postistic',
				'category' => 'AI & Automation',
				'tagline'  => 'AI content & social automation',
				'status'   => 'Live',
			),
			array(
				'id'       => 'crmistic',
				'name'     => 'CRMistic',
				'category' => 'Business Tools',
				'tagline'  => 'CRM for WordPress businesses',
				'status'   => 'Live',
			),
			array(
				'id'       => 'licenseistic',
				'name'     => 'Licenseistic',
				'category' => 'WordPress Plugins',
				'tagline'  => 'Plugin license manager',
				'status'   => 'Live',
			),
			array(
				'id'       => 'fflistic',
				'name'     => 'FFListic',
				'category' => 'Business Tools',
				'tagline'  => 'FFL transfer workflows',
				'status'   => 'Beta',
			),
			array(
				'id'       => 'travelistic',
				'name'     => 'Travelistic',
				'category' => 'Business Tools',
				'tagline'  => 'Travel & tour booking suite',
				'status'   => 'Coming Soon',
			),
			array(
				'id'       => 'verifyistic',
				'name'     => 'Verifyistic',
				'category' => 'Business Tools',
				'tagline'  => 'KYC & compliance toolkit',
				'status'   => 'Coming Soon',
			),
		);
	}
}
