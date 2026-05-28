<?php
/**
 * Marketing homepage.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

get_header();
?>

<section class="wpistic-hero">
	<div class="wpistic-hero__glow wpistic-hero__glow--1"></div>
	<div class="wpistic-hero__glow wpistic-hero__glow--2"></div>
	<div class="wpistic-hero__inner">
		<span class="wpistic-eyebrow"><?php esc_html_e( 'The WordPressistic ecosystem hub', 'wpistic' ); ?></span>
		<h1 class="wpistic-hero__title">
			<?php
			/* translators: highlighted brand phrase */
			echo wp_kses_post( __( 'Run your entire WordPress business from <span class="wpistic-grad">one workspace</span>.', 'wpistic' ) );
			?>
		</h1>
		<p class="wpistic-hero__sub">
			<?php esc_html_e( 'Licenses, memberships, AI agents, automations, CRM, and analytics — eleven products that share one account, one inbox, and one bill.', 'wpistic' ); ?>
		</p>
		<div class="wpistic-hero__cta">
			<a class="wpistic-btn wpistic-btn--green wpistic-btn--lg" href="<?php echo esc_url( home_url( '/pricing' ) ); ?>"><?php esc_html_e( 'Start free', 'wpistic' ); ?></a>
			<a class="wpistic-btn wpistic-btn--outline wpistic-btn--lg" href="<?php echo esc_url( home_url( '/products' ) ); ?>"><?php esc_html_e( 'Explore products', 'wpistic' ); ?></a>
		</div>
		<div class="wpistic-hero__trust">
			<?php esc_html_e( 'No credit card required · Cancel anytime · WordPress-native', 'wpistic' ); ?>
		</div>
	</div>
</section>

<section class="wpistic-section">
	<div class="wpistic-container">
		<div class="wpistic-section__head">
			<span class="wpistic-eyebrow"><?php esc_html_e( 'One ecosystem', 'wpistic' ); ?></span>
			<h2><?php esc_html_e( 'Eleven products. One account.', 'wpistic' ); ?></h2>
			<p><?php esc_html_e( 'Every WPistic product shares licenses, contacts, inbox, and automations — so your stack actually works together.', 'wpistic' ); ?></p>
		</div>

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
	</div>
</section>

<section class="wpistic-section wpistic-section--tint">
	<div class="wpistic-container">
		<div class="wpistic-feature-row">
			<?php
			$wpistic_pillars = array(
				array( 'spark', __( 'AI everywhere', 'wpistic' ), __( 'Agents for support, sales, SEO, and content — built into the platform.', 'wpistic' ) ),
				array( 'key', __( 'Unified licensing', 'wpistic' ), __( 'Activations, domains, renewals, and entitlements across every product.', 'wpistic' ) ),
				array( 'chart', __( 'Shared analytics', 'wpistic' ), __( 'Traffic, revenue, and AI usage from all your sites in one panel.', 'wpistic' ) ),
			);
			foreach ( $wpistic_pillars as $pillar ) :
				?>
				<div class="wpistic-feature">
					<div class="wpistic-feature__icon"></div>
					<h4><?php echo esc_html( $pillar[1] ); ?></h4>
					<p class="wpistic-muted"><?php echo esc_html( $pillar[2] ); ?></p>
				</div>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<?php get_template_part( 'template-parts/cta' ); ?>

<?php
get_footer();
