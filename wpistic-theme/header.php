<?php
/**
 * Site header.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<link rel="profile" href="https://gmpg.org/xfn/11" />
	<?php wp_head(); ?>
</head>
<body <?php body_class( 'wpistic-site' ); ?>>
<?php wp_body_open(); ?>
<a class="skip-link screen-reader-text" href="#wpistic-main"><?php esc_html_e( 'Skip to content', 'wpistic' ); ?></a>

<?php get_template_part( 'template-parts/site', 'header' ); ?>

<main id="wpistic-main" class="wpistic-main">
