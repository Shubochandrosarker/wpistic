<?php
/**
 * Template Name: WPistic · Marketing Section
 *
 * A flexible full-width marketing page: a styled hero from the page title +
 * excerpt, then the block-editor content, then the shared CTA. Use this for
 * Ecosystem, Platform, About, Affiliate, Press, and product detail pages.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

get_header();

while ( have_posts() ) :
	the_post();
	$wpistic_excerpt = has_excerpt() ? get_the_excerpt() : '';
	?>
	<section class="wpistic-pagehero">
		<div class="wpistic-pagehero__glow"></div>
		<div class="wpistic-container wpistic-container--narrow">
			<span class="wpistic-eyebrow"><?php echo esc_html( get_the_title() ); ?></span>
			<h1><?php the_title(); ?></h1>
			<?php if ( $wpistic_excerpt ) : ?>
				<p class="wpistic-pagehero__sub"><?php echo esc_html( $wpistic_excerpt ); ?></p>
			<?php endif; ?>
		</div>
	</section>

	<section class="wpistic-section">
		<div class="wpistic-container wpistic-container--narrow wpistic-page__body">
			<?php
			the_content();
			wp_link_pages();
			?>
		</div>
	</section>
	<?php
endwhile;

get_template_part( 'template-parts/cta' );

get_footer();
