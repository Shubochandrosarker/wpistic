<?php
/**
 * Template helper functions (presentation only).
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

/**
 * Output the WPistic logo lockup (custom logo if set, else bundled asset).
 *
 * @param string $variant purple|green|white.
 * @param bool   $dark    Whether to render the wordmark light.
 */
function wpistic_logo( string $variant = 'purple', bool $dark = false ): void {
	$home = esc_url( home_url( '/' ) );

	if ( has_custom_logo() ) {
		echo '<a class="wpistic-logo" href="' . $home . '" rel="home">';
		$logo_id = (int) get_theme_mod( 'custom_logo' );
		echo wp_get_attachment_image( $logo_id, 'full', false, array( 'alt' => get_bloginfo( 'name' ) ) );
		echo '</a>';
		return;
	}

	$variant = in_array( $variant, array( 'purple', 'green', 'white' ), true ) ? $variant : 'purple';
	$src     = WPISTIC_THEME_URI . '/assets/images/logo-' . $variant . '.png';
	printf(
		'<a class="wpistic-logo" href="%1$s" rel="home"><img src="%2$s" width="28" height="28" alt="%3$s" /><span class="wpistic-logo__word%4$s">WPistic</span></a>',
		$home,
		esc_url( $src ),
		esc_attr( get_bloginfo( 'name' ) ),
		$dark ? ' is-dark' : ''
	);
}

/**
 * Resolve the dashboard URL, accounting for login state.
 */
function wpistic_dashboard_url(): string {
	$url = home_url( '/dashboard/' );
	return esc_url( is_user_logged_in() ? $url : wp_login_url( $url ) );
}

/**
 * The product catalogue, pulled from WPistic Core when active, else a
 * static presentation fallback so the theme renders standalone.
 *
 * @return array<int,array<string,string>>
 */
function wpistic_products(): array {
	$fallback = array(
		array( 'name' => 'Chatbotistic', 'category' => 'AI & Automation', 'tagline' => 'AI WhatsApp + website chatbot', 'status' => 'Live' ),
		array( 'name' => 'Memberistic', 'category' => 'Business Tools', 'tagline' => 'Memberships & subscriptions', 'status' => 'Live' ),
		array( 'name' => 'Bookingistic', 'category' => 'Business Tools', 'tagline' => 'Booking & appointments', 'status' => 'Live' ),
		array( 'name' => 'Insightistic', 'category' => 'Analytics', 'tagline' => 'Unified analytics dashboard', 'status' => 'Live' ),
		array( 'name' => 'CRMistic', 'category' => 'Business Tools', 'tagline' => 'CRM for WordPress businesses', 'status' => 'Live' ),
		array( 'name' => 'Postistic', 'category' => 'AI & Automation', 'tagline' => 'AI content & social automation', 'status' => 'Live' ),
		array( 'name' => 'WPAgentistic', 'category' => 'AI & Automation', 'tagline' => 'AI agent marketplace', 'status' => 'Beta' ),
		array( 'name' => 'Licenseistic', 'category' => 'WordPress Plugins', 'tagline' => 'Plugin license manager', 'status' => 'Live' ),
	);

	/**
	 * Filter the marketing product list.
	 *
	 * @param array $fallback Default product list.
	 */
	return apply_filters( 'wpistic/theme/products', $fallback );
}

/**
 * Render a status pill.
 *
 * @param string $status Status label.
 */
function wpistic_status_pill( string $status ): string {
	$tone = array(
		'Live'        => 'green',
		'Beta'        => 'purple',
		'Coming Soon' => 'gray',
	);
	$class = 'wpistic-pill wpistic-pill--' . ( $tone[ $status ] ?? 'gray' );
	return '<span class="' . esc_attr( $class ) . '">' . esc_html( $status ) . '</span>';
}

/**
 * Render a form via the configured plugin shortcode, with a graceful
 * fallback when neither Bookingistic nor WPistic Contact Form is active.
 *
 * @param string $context contact|support|demo|booking.
 */
function wpistic_render_form( string $context = 'contact' ): void {
	$shortcode = '';

	if ( class_exists( '\\WPistic\\Core\\Plugin' ) ) {
		try {
			$adapter   = \WPistic\Core\Plugin::instance()->service( \WPistic\Core\Integrations\IntegrationRegistry::class )->bookingistic();
			$shortcode = $adapter->form_shortcode( $context );
		} catch ( \Throwable $e ) {
			$shortcode = '';
		}
	}

	if ( $shortcode && ( shortcode_exists( trim( $shortcode, '[]' ) ) || false !== strpos( $shortcode, ' ' ) ) ) {
		echo do_shortcode( $shortcode ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		return;
	}

	// Fallback: a simple mailto prompt so the page is never broken.
	echo '<div class="wpistic-form-fallback"><p>' . esc_html__( 'Our contact form plugin is being configured. In the meantime, reach us at', 'wpistic' ) . ' <a href="mailto:' . esc_attr( antispambot( get_option( 'admin_email' ) ) ) . '">' . esc_html( antispambot( get_option( 'admin_email' ) ) ) . '</a>.</p></div>';
}
