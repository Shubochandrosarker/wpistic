<?php
/**
 * Template Name: WPistic · Pricing
 *
 * Pricing is presentation only — plans/limits are owned by Memberistic and
 * surfaced via the memberistic/v1 REST endpoints in the dashboard.
 *
 * @package WPistic\Theme
 */

defined( 'ABSPATH' ) || exit;

get_header();

/**
 * Allow Memberistic (or a site admin via filter) to provide live plans.
 * Falls back to the canonical marketing tiers.
 */
$wpistic_plans = apply_filters(
	'wpistic/theme/pricing_plans',
	array(
		array(
			'name'     => __( 'Free', 'wpistic' ),
			'price'    => '$0',
			'period'   => __( 'forever', 'wpistic' ),
			'features' => array( '1 website', 'Core plugins', 'Community support' ),
			'cta'      => __( 'Start free', 'wpistic' ),
			'featured' => false,
		),
		array(
			'name'     => __( 'Pro', 'wpistic' ),
			'price'    => '$29',
			'period'   => __( 'per month', 'wpistic' ),
			'features' => array( '3 websites', 'All plugins', 'AI starter', 'Email support' ),
			'cta'      => __( 'Choose Pro', 'wpistic' ),
			'featured' => true,
		),
		array(
			'name'     => __( 'Business', 'wpistic' ),
			'price'    => '$79',
			'period'   => __( 'per month', 'wpistic' ),
			'features' => array( '10 websites', 'AI agents', 'Automations', 'Priority support' ),
			'cta'      => __( 'Choose Business', 'wpistic' ),
			'featured' => false,
		),
	)
);
?>
<section class="wpistic-section wpistic-section--center">
	<div class="wpistic-container">
		<header class="wpistic-section__head">
			<span class="wpistic-eyebrow"><?php esc_html_e( 'Pricing', 'wpistic' ); ?></span>
			<h1><?php esc_html_e( 'One subscription. Every product.', 'wpistic' ); ?></h1>
			<p><?php esc_html_e( 'Pick a plan and unlock the WordPressistic ecosystem. Upgrade, downgrade, or cancel anytime.', 'wpistic' ); ?></p>
		</header>

		<div class="wpistic-grid wpistic-grid--3 wpistic-pricing">
			<?php foreach ( $wpistic_plans as $plan ) : ?>
				<article class="wpistic-card wpistic-plan<?php echo ! empty( $plan['featured'] ) ? ' wpistic-plan--featured' : ''; ?>">
					<?php if ( ! empty( $plan['featured'] ) ) : ?>
						<span class="wpistic-pill wpistic-pill--purple"><?php esc_html_e( 'Most popular', 'wpistic' ); ?></span>
					<?php endif; ?>
					<h3><?php echo esc_html( $plan['name'] ); ?></h3>
					<div class="wpistic-plan__price"><?php echo esc_html( $plan['price'] ); ?><span><?php echo esc_html( $plan['period'] ); ?></span></div>
					<ul class="wpistic-plan__features">
						<?php foreach ( $plan['features'] as $feature ) : ?>
							<li><?php echo esc_html( $feature ); ?></li>
						<?php endforeach; ?>
					</ul>
					<a class="wpistic-btn <?php echo ! empty( $plan['featured'] ) ? 'wpistic-btn--green' : 'wpistic-btn--outline'; ?> wpistic-btn--block" href="<?php echo wpistic_dashboard_url(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>">
						<?php echo esc_html( $plan['cta'] ); ?>
					</a>
				</article>
			<?php endforeach; ?>
		</div>

		<?php
		// Render any editor content beneath the table (FAQ, comparison, etc.).
		while ( have_posts() ) :
			the_post();
			the_content();
		endwhile;
		?>
	</div>
</section>
<?php
get_footer();
