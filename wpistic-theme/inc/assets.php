<?php
/**
 * Front-end asset loading. Public assets load only on public pages
 * (never on the /dashboard SPA, which the dashboard plugin owns).
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

/**
 * Enqueue theme styles + fonts on the public site.
 */
function wpistic_enqueue_assets(): void {
	// Never load marketing CSS inside the dashboard SPA.
	if ( (bool) get_query_var( 'wpistic_dashboard' ) ) {
		return;
	}

	// Design tokens (shared with the dashboard for visual consistency).
	wp_enqueue_style(
		'wpistic-tokens',
		WPISTIC_THEME_URI . '/assets/css/tokens.css',
		array(),
		WPISTIC_THEME_VERSION
	);

	// Theme presentation styles.
	wp_enqueue_style(
		'wpistic-theme',
		WPISTIC_THEME_URI . '/assets/css/theme.css',
		array( 'wpistic-tokens' ),
		WPISTIC_THEME_VERSION
	);

	// Lightweight nav interactivity (mega-menu, mobile toggle).
	wp_enqueue_script(
		'wpistic-nav',
		WPISTIC_THEME_URI . '/assets/js/nav.js',
		array(),
		WPISTIC_THEME_VERSION,
		true
	);

	if ( is_singular() && comments_open() && get_option( 'thread_comments' ) ) {
		wp_enqueue_script( 'comment-reply' );
	}
}
add_action( 'wp_enqueue_scripts', 'wpistic_enqueue_assets' );

/**
 * Preconnect to Google Fonts for better LCP.
 */
function wpistic_resource_hints( array $hints, string $relation ): array {
	if ( 'preconnect' === $relation ) {
		$hints[] = array(
			'href'        => 'https://fonts.gstatic.com',
			'crossorigin' => 'anonymous',
		);
		$hints[] = 'https://fonts.googleapis.com';
	}
	return $hints;
}
add_filter( 'wp_resource_hints', 'wpistic_resource_hints', 10, 2 );

/**
 * Trim emoji + extra cruft for stronger Core Web Vitals on the marketing site.
 */
function wpistic_perf_cleanup(): void {
	remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
	remove_action( 'wp_print_styles', 'print_emoji_styles' );
	remove_action( 'wp_head', 'wp_generator' );
	remove_action( 'wp_head', 'wlwmanifest_link' );
	remove_action( 'wp_head', 'rsd_link' );
}
add_action( 'init', 'wpistic_perf_cleanup' );
