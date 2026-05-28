<?php
/**
 * Shared call-to-action band.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;
?>
<section class="wpistic-cta">
	<div class="wpistic-cta__inner">
		<div class="wpistic-cta__glow"></div>
		<h2><?php esc_html_e( 'Ready to run your WordPress business in one place?', 'wpistic' ); ?></h2>
		<p><?php esc_html_e( 'Start free today. Connect a site, activate a license, and launch your first automation in minutes.', 'wpistic' ); ?></p>
		<div class="wpistic-cta__actions">
			<a class="wpistic-btn wpistic-btn--white wpistic-btn--lg" href="<?php echo esc_url( home_url( '/pricing' ) ); ?>"><?php esc_html_e( 'Start free', 'wpistic' ); ?></a>
			<a class="wpistic-btn wpistic-btn--dark-outline wpistic-btn--lg" href="<?php echo esc_url( home_url( '/contact' ) ); ?>"><?php esc_html_e( 'Talk to sales', 'wpistic' ); ?></a>
		</div>
	</div>
</section>
