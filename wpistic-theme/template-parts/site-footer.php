<?php
/**
 * Marketing footer with link columns + legal row.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

$wpistic_footer_menus = array(
	'footer-pro'  => __( 'Product', 'wpistic' ),
	'footer-eco'  => __( 'Ecosystem', 'wpistic' ),
	'footer-comp' => __( 'Company', 'wpistic' ),
);
?>
<footer class="wpistic-footer">
	<div class="wpistic-footer__inner">
		<div class="wpistic-footer__brand">
			<?php wpistic_logo( 'white', true ); ?>
			<p><?php esc_html_e( 'The central hub for the WordPressistic ecosystem — licenses, memberships, AI, and analytics in one workspace.', 'wpistic' ); ?></p>
			<a class="wpistic-btn wpistic-btn--green" href="<?php echo esc_url( home_url( '/pricing' ) ); ?>"><?php esc_html_e( 'Start free', 'wpistic' ); ?></a>
		</div>

		<div class="wpistic-footer__cols">
			<?php foreach ( $wpistic_footer_menus as $location => $title ) : ?>
				<div class="wpistic-footer__col">
					<h4><?php echo esc_html( $title ); ?></h4>
					<?php
					if ( has_nav_menu( $location ) ) {
						wp_nav_menu(
							array(
								'theme_location' => $location,
								'container'      => false,
								'menu_class'     => 'wpistic-footer__list',
								'depth'          => 1,
								'fallback_cb'    => false,
							)
						);
					}
					?>
				</div>
			<?php endforeach; ?>
		</div>
	</div>

	<div class="wpistic-footer__legal">
		<div class="wpistic-footer__legal-inner">
			<span>&copy; <?php echo esc_html( gmdate( 'Y' ) ); ?> <?php bloginfo( 'name' ); ?>. <?php esc_html_e( 'All rights reserved.', 'wpistic' ); ?></span>
			<?php
			if ( has_nav_menu( 'footer-legal' ) ) {
				wp_nav_menu(
					array(
						'theme_location' => 'footer-legal',
						'container'      => false,
						'menu_class'     => 'wpistic-footer__legal-list',
						'depth'          => 1,
						'fallback_cb'    => false,
					)
				);
			}
			?>
		</div>
	</div>
</footer>
