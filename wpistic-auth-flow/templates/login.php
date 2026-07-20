<?php
/**
 * WPistic Auth Flow — standalone /login page.
 *
 * Plain PHP + vanilla JS, no build step, no WordPress branding.
 *
 * @package WPistic\Auth
 */

defined( 'ABSPATH' ) || exit;

$wpistic_auth_nonce = wp_create_nonce( 'wp_rest' );
$wpistic_auth_rest  = esc_url_raw( rest_url( 'wpistic-auth/v1/login' ) );
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title><?php echo esc_html__( 'Log in · WPistic', 'wpistic-auth-flow' ); ?></title>
<style><?php echo file_get_contents( WPISTIC_AUTH_PATH . 'assets/auth.css' ); // phpcs:ignore ?></style>
</head>
<body class="wpistic-auth-body">
<main class="wpistic-auth-shell">
	<section class="wpistic-auth-panel wpistic-auth-panel--brand">
		<div class="wpistic-auth-brand">
			<span class="wpistic-auth-logo-dot"></span>
			<span class="wpistic-auth-brand-name">WPistic</span>
		</div>
		<p class="wpistic-auth-brand-copy"><?php echo esc_html__( 'One dashboard for every WordPress product your business runs on.', 'wpistic-auth-flow' ); ?></p>
	</section>
	<section class="wpistic-auth-panel wpistic-auth-panel--form">
		<span class="wpistic-auth-eyebrow"><?php echo esc_html__( 'Welcome back', 'wpistic-auth-flow' ); ?></span>
		<h1><?php echo esc_html__( 'Log in to WPistic', 'wpistic-auth-flow' ); ?></h1>
		<form id="wpistic-login-form" novalidate>
			<label>
				<span><?php echo esc_html__( 'Email or username', 'wpistic-auth-flow' ); ?></span>
				<input type="text" name="identifier" autocomplete="username" required />
			</label>
			<label>
				<span><?php echo esc_html__( 'Password', 'wpistic-auth-flow' ); ?></span>
				<input type="password" name="password" autocomplete="current-password" required />
			</label>
			<div id="wpistic-auth-error" class="wpistic-auth-error" hidden></div>
			<button type="submit" class="wpistic-auth-btn"><?php echo esc_html__( 'Log in', 'wpistic-auth-flow' ); ?></button>
		</form>
		<p class="wpistic-auth-switch">
			<?php echo esc_html__( 'New here?', 'wpistic-auth-flow' ); ?>
			<a href="<?php echo esc_url( home_url( '/register/' ) ); ?>"><?php echo esc_html__( 'Create an account', 'wpistic-auth-flow' ); ?></a>
		</p>
	</section>
</main>
<script>
(function () {
	var form = document.getElementById('wpistic-login-form');
	var errorBox = document.getElementById('wpistic-auth-error');
	var restUrl = <?php echo wp_json_encode( $wpistic_auth_rest ); ?>;
	var nonce = <?php echo wp_json_encode( $wpistic_auth_nonce ); ?>;

	form.addEventListener('submit', function (e) {
		e.preventDefault();
		errorBox.hidden = true;
		var btn = form.querySelector('button[type="submit"]');
		var originalLabel = btn.textContent;
		btn.disabled = true;
		btn.textContent = <?php echo wp_json_encode( __( 'Logging in…', 'wpistic-auth-flow' ) ); ?>;

		fetch(restUrl, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': nonce
			},
			body: JSON.stringify({
				identifier: form.identifier.value,
				password: form.password.value
			})
		}).then(function (res) {
			return res.json().then(function (data) {
				return { ok: res.ok, data: data };
			});
		}).then(function (result) {
			if (!result.ok) {
				throw new Error((result.data && result.data.message) || <?php echo wp_json_encode( __( 'Login failed.', 'wpistic-auth-flow' ) ); ?>);
			}
			window.location.href = result.data.redirect || '/dashboard';
		}).catch(function (err) {
			errorBox.textContent = err.message;
			errorBox.hidden = false;
			btn.disabled = false;
			btn.textContent = originalLabel;
		});
	});
})();
</script>
</body>
</html>
<?php
exit;
