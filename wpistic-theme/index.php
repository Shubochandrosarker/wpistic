<?php
/**
 * Fallback template — blog index / archives.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

get_header();
?>
<section class="wpistic-section">
	<div class="wpistic-container">
		<header class="wpistic-section__head">
			<h1>
				<?php
				if ( is_home() && ! is_front_page() ) {
					single_post_title();
				} elseif ( is_archive() ) {
					the_archive_title();
				} elseif ( is_search() ) {
					/* translators: %s: search query. */
					printf( esc_html__( 'Results for “%s”', 'wpistic' ), '<span>' . esc_html( get_search_query() ) . '</span>' );
				} else {
					esc_html_e( 'Latest from the blog', 'wpistic' );
				}
				?>
			</h1>
		</header>

		<?php if ( have_posts() ) : ?>
			<div class="wpistic-grid wpistic-grid--3">
				<?php
				while ( have_posts() ) :
					the_post();
					?>
					<article <?php post_class( 'wpistic-card wpistic-card--hover' ); ?>>
						<?php if ( has_post_thumbnail() ) : ?>
							<a class="wpistic-card__media" href="<?php the_permalink(); ?>"><?php the_post_thumbnail( 'medium_large' ); ?></a>
						<?php endif; ?>
						<span class="wpistic-card__cat"><?php echo esc_html( get_the_date() ); ?></span>
						<h3><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
						<p class="wpistic-muted"><?php echo esc_html( wp_trim_words( get_the_excerpt(), 22 ) ); ?></p>
					</article>
				<?php endwhile; ?>
			</div>

			<div class="wpistic-pagination">
				<?php the_posts_pagination( array( 'mid_size' => 1 ) ); ?>
			</div>
		<?php else : ?>
			<p class="wpistic-muted"><?php esc_html_e( 'Nothing here yet.', 'wpistic' ); ?></p>
		<?php endif; ?>
	</div>
</section>
<?php
get_footer();
