<?php
/**
 * Theme setup: supports, menus, image sizes, page templates.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

/**
 * Register theme supports and navigation menus.
 */
function wpistic_theme_setup(): void {
	load_theme_textdomain( 'wpistic', WPISTIC_THEME_DIR . '/languages' );

	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'style', 'script', 'navigation-widgets' ) );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'align-wide' );
	add_theme_support( 'editor-styles' );
	add_theme_support(
		'custom-logo',
		array(
			'height'      => 40,
			'width'       => 160,
			'flex-width'  => true,
			'flex-height' => true,
		)
	);

	register_nav_menus(
		array(
			'primary'      => __( 'Primary Menu', 'wpistic' ),
			'footer-pro'   => __( 'Footer · Product', 'wpistic' ),
			'footer-eco'   => __( 'Footer · Ecosystem', 'wpistic' ),
			'footer-comp'  => __( 'Footer · Company', 'wpistic' ),
			'footer-legal' => __( 'Footer · Legal', 'wpistic' ),
		)
	);
}
add_action( 'after_setup_theme', 'wpistic_theme_setup' );

/**
 * Register the marketing page templates so editors can assign them to Pages.
 *
 * @param array<string,string> $templates Existing templates.
 * @return array<string,string>
 */
function wpistic_register_page_templates( array $templates ): array {
	$templates['templates/page-pricing.php']  = __( 'WPistic · Pricing', 'wpistic' );
	$templates['templates/page-products.php']  = __( 'WPistic · Products', 'wpistic' );
	$templates['templates/page-contact.php']   = __( 'WPistic · Contact', 'wpistic' );
	$templates['templates/page-marketing.php'] = __( 'WPistic · Marketing Section', 'wpistic' );
	$templates['templates/page-legal.php']     = __( 'WPistic · Legal', 'wpistic' );
	return $templates;
}
add_filter( 'theme_page_templates', 'wpistic_register_page_templates' );

/**
 * Load assigned page templates from the /templates directory.
 *
 * @param string $template Resolved template path.
 * @return string
 */
function wpistic_load_page_template( string $template ): string {
	if ( ! is_page() ) {
		return $template;
	}
	$assigned = get_page_template_slug( get_queried_object_id() );
	if ( $assigned && 0 === strpos( $assigned, 'templates/' ) ) {
		$candidate = WPISTIC_THEME_DIR . '/' . $assigned;
		if ( is_readable( $candidate ) ) {
			return $candidate;
		}
	}
	return $template;
}
add_filter( 'template_include', 'wpistic_load_page_template', 99 );

/**
 * Register a widget area for the footer.
 */
function wpistic_widgets_init(): void {
	register_sidebar(
		array(
			'name'          => __( 'Footer Newsletter', 'wpistic' ),
			'id'            => 'footer-newsletter',
			'description'   => __( 'Shown in the footer call-to-action area.', 'wpistic' ),
			'before_widget' => '<div class="wpistic-footer-widget">',
			'after_widget'  => '</div>',
			'before_title'  => '<h4>',
			'after_title'   => '</h4>',
		)
	);
}
add_action( 'widgets_init', 'wpistic_widgets_init' );

/**
 * Content width for embeds.
 */
function wpistic_content_width(): void {
	$GLOBALS['content_width'] = 1240;
}
add_action( 'after_setup_theme', 'wpistic_content_width', 0 );
