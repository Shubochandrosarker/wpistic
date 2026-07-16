<?php
/**
 * PHPUnit bootstrap for wpistic-core unit tests.
 *
 * Runs against Brain Monkey (stubbed WordPress functions) rather than a
 * booted WordPress install — fast, isolated unit tests for framework-agnostic
 * logic (security, rate limiting, permission checks).
 *
 * @package WPistic\Core
 */

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/stubs/wp-error.php';
require_once __DIR__ . '/stubs/wp-rest-request.php';
require_once __DIR__ . '/stubs/wp-rest-response.php';

if ( ! defined( 'ABSPATH' ) ) {
	// Points at tests/fixtures/wp-root/, which carries a stub
	// wp-admin/includes/upgrade.php so Schema::install() can require it.
	define( 'ABSPATH', __DIR__ . '/fixtures/wp-root/' );
}

if ( ! defined( 'LOGGED_IN_COOKIE' ) ) {
	define( 'LOGGED_IN_COOKIE', 'wordpress_logged_in' );
}

if ( ! defined( 'ARRAY_A' ) ) {
	define( 'ARRAY_A', 'ARRAY_A' );
}

if ( ! defined( 'MINUTE_IN_SECONDS' ) ) {
	define( 'MINUTE_IN_SECONDS', 60 );
}

if ( ! defined( 'HOUR_IN_SECONDS' ) ) {
	define( 'HOUR_IN_SECONDS', 60 * MINUTE_IN_SECONDS );
}

if ( ! defined( 'DAY_IN_SECONDS' ) ) {
	define( 'DAY_IN_SECONDS', 24 * HOUR_IN_SECONDS );
}
