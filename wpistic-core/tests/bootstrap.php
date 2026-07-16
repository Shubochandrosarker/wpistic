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

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', sys_get_temp_dir() . '/' );
}

if ( ! defined( 'LOGGED_IN_COOKIE' ) ) {
	define( 'LOGGED_IN_COOKIE', 'wordpress_logged_in' );
}

if ( ! defined( 'ARRAY_A' ) ) {
	define( 'ARRAY_A', 'ARRAY_A' );
}
