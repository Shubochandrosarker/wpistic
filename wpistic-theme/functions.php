<?php
/**
 * WPistic theme bootstrap.
 *
 * Keeps presentation only — all SaaS/business logic lives in the WPistic
 * plugins. This file wires up theme supports, menus, and asset loading.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

define( 'WPISTIC_THEME_VERSION', '1.0.0' );
define( 'WPISTIC_THEME_DIR', get_template_directory() );
define( 'WPISTIC_THEME_URI', get_template_directory_uri() );

require_once WPISTIC_THEME_DIR . '/inc/setup.php';
require_once WPISTIC_THEME_DIR . '/inc/assets.php';
require_once WPISTIC_THEME_DIR . '/inc/template-tags.php';
