<?php
/**
 * Template Name: WPistic · Contact
 *
 * Forms are rendered by Bookingistic / WPistic Contact Form via shortcodes
 * resolved through the core integration adapter.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

get_header();

$wpistic_form_context = get_post_meta( get_the_ID(), 'wpistic_form_context', true ) ?: 'contact';
?>
<section class="wpistic-section">
	<div class="wpistic-container wpistic-contact">
		<div class="wpistic-contact__intro">
			<span class="wpistic-eyebrow"><?php esc_html_e( 'Contact', 'wpistic' ); ?></span>
			<h1><?php the_title(); ?></h1>
			<div class="wpistic-page__body">
				<?php
				while ( have_posts() ) :
					the_post();
					the_content();
				endwhile;
				?>
			</div>
		</div>
		<div class="wpistic-contact__form wpistic-card">
			<?php wpistic_render_form( $wpistic_form_context ); ?>
		</div>
	</div>
</section>
<?php
get_footer();
