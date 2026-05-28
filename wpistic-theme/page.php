<?php
/**
 * Default page template (renders editor content inside the styled shell).
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
				<h1><?php the_title(); ?></h1>
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
