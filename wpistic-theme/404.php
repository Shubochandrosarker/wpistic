<?php
/**
 * 404 template.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

get_header();
?>
<section class="wpistic-section wpistic-section--center">
	<div class="wpistic-container wpistic-container--narrow">
		<span class="wpistic-eyebrow">404</span>
		<h1><?php esc_html_e( 'This page wandered off.', 'wpistic' ); ?></h1>
		<p class="wpistic-muted"><?php esc_html_e( 'The page you’re looking for doesn’t exist or has moved.', 'wpistic' ); ?></p>
		<p><a class="wpistic-btn wpistic-btn--primary" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Back home', 'wpistic' ); ?></a></p>
	</div>
</section>
<?php
get_footer();
