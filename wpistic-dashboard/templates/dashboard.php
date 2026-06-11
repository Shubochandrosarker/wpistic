<?php
/**
 * Dashboard SPA mount template.
 *
 * Renders a minimal HTML document with a single #wpistic-root node that the
 * React app hydrates. All routing happens client-side via React Router.
 *
 * @package WPistic\Dashboard
 */

defined( 'ABSPATH' ) || exit;

$wpistic_build_missing = ! wp_script_is( 'wpistic-dashboard', 'enqueued' )
	|| '' === wp_scripts()->registered['wpistic-dashboard']->src;

?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="robots" content="noindex, nofollow" />
	<title><?php echo esc_html__( 'Dashboard · WPistic', 'wpistic-dashboard' ); ?></title>
	<link rel="icon" href="<?php echo esc_url( WPISTIC_DASH_URL . 'assets/logo-purple.png' ); ?>" />
	<?php // No-flash theme init: resolves the saved preference (or the OS setting) and sets data-theme before first paint. ?>
	<script>
	(function () {
		try {
			var pref = localStorage.getItem('wpistic-theme') || 'system';
			var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
			document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
		} catch (e) {
			document.documentElement.setAttribute('data-theme', 'light');
		}
	})();
	</script>
	<?php wp_head(); ?>
</head>
<body class="wpistic-dashboard-body">
	<div id="wpistic-root">
		<?php // Server-rendered loading shell shown until the bundle boots. ?>
		<div id="wpistic-boot-skeleton" style="position:fixed;inset:0;display:grid;place-items:center;background:var(--app-page,#F0F2FF);font-family:'Plus Jakarta Sans',system-ui,sans-serif;">
			<div style="display:flex;flex-direction:column;align-items:center;gap:16px;">
				<img src="<?php echo esc_url( WPISTIC_DASH_URL . 'assets/logo-purple.png' ); ?>" alt="WPistic" width="44" height="44" style="animation:wpistic-pulse 1.4s ease-in-out infinite;" />
				<div style="font-size:13px;color:var(--app-text-3,#6B7280);font-weight:600;letter-spacing:.04em;">
					<?php echo esc_html__( 'Loading your workspace…', 'wpistic-dashboard' ); ?>
				</div>
			</div>
		</div>
		<style>@keyframes wpistic-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.92)}}</style>
	</div>

	<?php if ( $wpistic_build_missing ) : ?>
		<div style="position:fixed;bottom:16px;left:16px;right:16px;max-width:520px;margin:0 auto;background:#1A1659;color:#fff;padding:16px 20px;border-radius:14px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;z-index:9999;">
			<strong><?php echo esc_html__( 'Dashboard bundle not built yet.', 'wpistic-dashboard' ); ?></strong><br />
			<?php echo esc_html__( 'Run', 'wpistic-dashboard' ); ?>
			<code style="background:rgba(255,255,255,.15);padding:2px 6px;border-radius:6px;">npm install &amp;&amp; npm run build</code>
			<?php echo esc_html__( 'inside the wpistic-dashboard plugin folder.', 'wpistic-dashboard' ); ?>
		</div>
	<?php endif; ?>

	<?php wp_footer(); ?>
</body>
</html>
<?php
exit; // We render a standalone document; stop WP from appending anything.
