<?php
/**
 * Template Name: WPistic · Legal
 *
 * Clean, readable template for Privacy, Terms, Refunds, and Security pages.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

get_header();

while ( have_posts() ) :
	the_post();
	?>
	<article class="wpistic-page wpistic-legal">
		<header class="wpistic-page__head">
			<div class="wpistic-container wpistic-container--narrow">
				<span class="wpistic-eyebrow"><?php esc_html_e( 'Legal', 'wpistic' ); ?></span>
				<h1><?php the_title(); ?></h1>
				<p class="wpistic-muted">
					<?php
					/* translators: %s: last updated date. */
					printf( esc_html__( 'Last updated %s', 'wpistic' ), esc_html( get_the_modified_date() ) );
					?>
				</p>
			</div>
		</header>
		<div class="wpistic-page__body wpistic-container wpistic-container--narrow">
			<?php
			the_content();
			wp_link_pages();
			?>
		</div>
	</article>
	<?php
endwhile;

get_footer();
