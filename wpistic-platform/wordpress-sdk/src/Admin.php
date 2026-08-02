<?php
/**
 * License settings screen + admin notices. Every incoming value is
 * sanitized, every output escaped, every action nonce-protected.
 */

namespace WPistic\Sdk;

class Admin {

	/** @var Licensing */
	private $license;

	public function __construct( Licensing $license ) {
		$this->license = $license;
	}

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_post_' . $this->action_name( 'activate' ), array( $this, 'handle_activate' ) );
		add_action( 'admin_post_' . $this->action_name( 'deactivate' ), array( $this, 'handle_deactivate' ) );
		add_action( 'admin_notices', array( $this, 'grace_notice' ) );
	}

	private function slug(): string {
		return $this->license->product_slug();
	}

	private function page_slug(): string {
		return 'wpistic-' . $this->slug() . '-license';
	}

	private function action_name( string $verb ): string {
		return 'wpistic_' . $this->slug() . '_' . $verb;
	}

	public function add_menu(): void {
		add_options_page(
			sprintf( /* translators: %s: product name */ __( '%s License', 'wpistic-sdk' ), ucfirst( $this->slug() ) ),
			sprintf( __( '%s License', 'wpistic-sdk' ), ucfirst( $this->slug() ) ),
			'manage_options',
			$this->page_slug(),
			array( $this, 'render_page' )
		);
	}

	public function handle_activate(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage licenses.', 'wpistic-sdk' ) );
		}
		check_admin_referer( $this->action_name( 'activate' ) );

		$key    = isset( $_POST['wpistic_license_key'] ) ? sanitize_text_field( wp_unslash( $_POST['wpistic_license_key'] ) ) : '';
		$result = $this->license->activate( $key );

		$args = is_wp_error( $result )
			? array( 'wpistic_error' => rawurlencode( $result->get_error_message() ) )
			: array( 'wpistic_activated' => '1' );
		wp_safe_redirect( add_query_arg( $args, admin_url( 'options-general.php?page=' . $this->page_slug() ) ) );
		exit;
	}

	public function handle_deactivate(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage licenses.', 'wpistic-sdk' ) );
		}
		check_admin_referer( $this->action_name( 'deactivate' ) );

		$this->license->deactivate();
		wp_safe_redirect( add_query_arg( 'wpistic_deactivated', '1', admin_url( 'options-general.php?page=' . $this->page_slug() ) ) );
		exit;
	}

	public function grace_notice(): void {
		$remaining = $this->license->grace_seconds_remaining();
		if ( null === $remaining ) {
			return;
		}
		$days = max( 1, (int) ceil( $remaining / DAY_IN_SECONDS ) );
		printf(
			'<div class="notice notice-warning"><p>%s</p></div>',
			esc_html(
				sprintf(
					/* translators: 1: product name, 2: number of days */
					__( '%1$s cannot reach the WPistic licensing service. Premium features stay active for %2$d more day(s) — check your connection or license from the settings page.', 'wpistic-sdk' ),
					ucfirst( $this->slug() ),
					$days
				)
			)
		);
	}

	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$status = $this->license->status();
		?>
		<div class="wrap">
			<h1><?php echo esc_html( sprintf( __( '%s License', 'wpistic-sdk' ), ucfirst( $this->slug() ) ) ); ?></h1>

			<?php if ( isset( $_GET['wpistic_activated'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
				<div class="notice notice-success"><p><?php esc_html_e( 'License activated. Premium features are enabled.', 'wpistic-sdk' ); ?></p></div>
			<?php endif; ?>
			<?php if ( isset( $_GET['wpistic_deactivated'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
				<div class="notice notice-info"><p><?php esc_html_e( 'License deactivated on this site.', 'wpistic-sdk' ); ?></p></div>
			<?php endif; ?>
			<?php if ( isset( $_GET['wpistic_error'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
				<div class="notice notice-error"><p><?php echo esc_html( rawurldecode( sanitize_text_field( wp_unslash( $_GET['wpistic_error'] ) ) ) ); ?></p></div>
			<?php endif; ?>

			<?php if ( $status['connected'] ) : ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'License', 'wpistic-sdk' ); ?></th>
						<td><code><?php echo esc_html( $status['key_mask'] ); ?></code></td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Status', 'wpistic-sdk' ); ?></th>
						<td>
							<?php if ( $status['active'] ) : ?>
								<span style="color:#00a32a;font-weight:600;"><?php esc_html_e( 'Active', 'wpistic-sdk' ); ?></span>
							<?php else : ?>
								<span style="color:#d63638;font-weight:600;"><?php echo esc_html( ucfirst( str_replace( '_', ' ', $status['status'] ) ) ); ?></span>
							<?php endif; ?>
							<?php if ( '' !== $status['plan'] ) : ?>
								— <?php echo esc_html( ucfirst( $status['plan'] ) ); ?> <?php esc_html_e( 'plan', 'wpistic-sdk' ); ?>
							<?php endif; ?>
						</td>
					</tr>
					<?php if ( '' !== $status['expires_at'] ) : ?>
						<tr>
							<th scope="row"><?php esc_html_e( 'Renews', 'wpistic-sdk' ); ?></th>
							<td><?php echo esc_html( gmdate( 'F j, Y', strtotime( $status['expires_at'] ) ) ); ?></td>
						</tr>
					<?php endif; ?>
				</table>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<input type="hidden" name="action" value="<?php echo esc_attr( $this->action_name( 'deactivate' ) ); ?>" />
					<?php wp_nonce_field( $this->action_name( 'deactivate' ) ); ?>
					<?php submit_button( __( 'Deactivate on this site', 'wpistic-sdk' ), 'secondary' ); ?>
				</form>
				<p>
					<a href="https://app.wpistic.com/licenses" target="_blank" rel="noopener">
						<?php esc_html_e( 'Manage licenses in your WPistic dashboard →', 'wpistic-sdk' ); ?>
					</a>
				</p>
			<?php else : ?>
				<p><?php esc_html_e( 'Enter your license key to unlock premium features and updates. Find it in your WPistic dashboard.', 'wpistic-sdk' ); ?></p>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<input type="hidden" name="action" value="<?php echo esc_attr( $this->action_name( 'activate' ) ); ?>" />
					<?php wp_nonce_field( $this->action_name( 'activate' ) ); ?>
					<table class="form-table" role="presentation">
						<tr>
							<th scope="row">
								<label for="wpistic_license_key"><?php esc_html_e( 'License key', 'wpistic-sdk' ); ?></label>
							</th>
							<td>
								<input type="password" class="regular-text" id="wpistic_license_key" name="wpistic_license_key"
									placeholder="<?php echo esc_attr( $this->slug() . '_…' ); ?>" autocomplete="off" required />
							</td>
						</tr>
					</table>
					<?php submit_button( __( 'Activate license', 'wpistic-sdk' ) ); ?>
				</form>
			<?php endif; ?>
		</div>
		<?php
	}
}
