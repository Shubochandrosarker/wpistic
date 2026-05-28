<?php
/**
 * Sticky marketing navigation with mega-menu support.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;
?>
<header class="wpistic-nav" id="wpistic-nav">
	<div class="wpistic-nav__inner">
		<div class="wpistic-nav__brand">
			<?php wpistic_logo( 'purple' ); ?>
		</div>

		<nav class="wpistic-nav__menu" aria-label="<?php esc_attr_e( 'Primary', 'wpistic' ); ?>">
			<?php
			if ( has_nav_menu( 'primary' ) ) {
				wp_nav_menu(
					array(
						'theme_location' => 'primary',
						'container'      => false,
						'menu_class'     => 'wpistic-nav__list',
						'depth'          => 2,
						'fallback_cb'    => false,
					)
				);
			} else {
				// Sensible default menu mirroring the approved UI.
				$defaults = array(
					'Products'  => '/products',
					'Ecosystem' => '/ecosystem',
					'Platform'  => '/platform',
					'Pricing'   => '/pricing',
				);
				echo '<ul class="wpistic-nav__list">';
				foreach ( $defaults as $label => $path ) {
					printf(
						'<li><a href="%1$s">%2$s</a></li>',
						esc_url( home_url( $path ) ),
						esc_html( $label )
					);
				}
				echo '</ul>';
			}
			?>
		</nav>

		<div class="wpistic-nav__actions">
			<a class="wpistic-btn wpistic-btn--ghost" href="<?php echo wpistic_dashboard_url(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>">
				<?php echo is_user_logged_in() ? esc_html__( 'Dashboard', 'wpistic' ) : esc_html__( 'Sign in', 'wpistic' ); ?>
			</a>
			<a class="wpistic-btn wpistic-btn--primary" href="<?php echo esc_url( home_url( '/pricing' ) ); ?>">
				<?php esc_html_e( 'Start Free', 'wpistic' ); ?>
			</a>
			<button class="wpistic-nav__toggle" aria-label="<?php esc_attr_e( 'Menu', 'wpistic' ); ?>" aria-expanded="false">
				<span></span><span></span><span></span>
			</button>
		</div>
	</div>
</header>
