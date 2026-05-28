<?php
/**
 * Template Name: WPistic · Products
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

get_header();
?>
<section class="wpistic-section">
	<div class="wpistic-container">
		<header class="wpistic-section__head">
			<span class="wpistic-eyebrow"><?php esc_html_e( 'Products', 'wpistic' ); ?></span>
			<h1><?php esc_html_e( 'The WordPressistic product line', 'wpistic' ); ?></h1>
			<p><?php esc_html_e( 'Eleven plugins for content, members, commerce, AI, and operations — all sharing one workspace.', 'wpistic' ); ?></p>
		</header>

		<div class="wpistic-grid wpistic-grid--3">
			<?php foreach ( wpistic_products() as $product ) : ?>
				<article class="wpistic-card wpistic-card--hover">
					<div class="wpistic-card__top">
						<div class="wpistic-glyph wpistic-glyph--<?php echo esc_attr( sanitize_title( $product['category'] ) ); ?>"></div>
						<?php echo wpistic_status_pill( $product['status'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
					</div>
					<h3><?php echo esc_html( $product['name'] ); ?></h3>
					<p class="wpistic-muted"><?php echo esc_html( $product['tagline'] ); ?></p>
					<span class="wpistic-card__cat"><?php echo esc_html( $product['category'] ); ?></span>
				</article>
			<?php endforeach; ?>
		</div>

		<?php
		while ( have_posts() ) :
			the_post();
			the_content();
		endwhile;
		?>
	</div>
</section>
<?php get_template_part( 'template-parts/cta' ); ?>
<?php
get_footer();
