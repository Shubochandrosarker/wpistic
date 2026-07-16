<?php
/**
 * PHPUnit bootstrap for licenseistic-memberistic-addon unit tests.
 *
 * Runs against Brain Monkey (stubbed WordPress functions) rather than a
 * booted WordPress install.
 *
 * @package WPistic\Bridge
 */

require_once __DIR__ . '/../vendor/autoload.php';

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', sys_get_temp_dir() . '/' );
}
