<?php
/**
 * Single post template.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

get_header();

while ( have_posts() ) :
	the_post();
	?>
	<article <?php post_class( 'wpistic-page' ); ?>>
		<header class="wpistic-page__head">
			<div class="wpistic-container wpistic-container--narrow">
				<span class="wpistic-eyebrow"><?php echo esc_html( get_the_date() ); ?></span>
				<h1><?php the_title(); ?></h1>
			</div>
		</header>
		<?php if ( has_post_thumbnail() ) : ?>
			<div class="wpistic-container"><div class="wpistic-page__media"><?php the_post_thumbnail( 'large' ); ?></div></div>
		<?php endif; ?>
		<div class="wpistic-page__body wpistic-container wpistic-container--narrow">
			<?php
			the_content();
			wp_link_pages();
			if ( comments_open() || get_comments_number() ) {
				comments_template();
			}
			?>
		</div>
	</article>
	<?php
endwhile;

get_footer();
