<?php
/**
 * Enqueues the dashboard bundle — only on /dashboard routes.
 *
 * @package WPistic\Dashboard
 */

namespace WPistic\Dashboard;

defined( 'ABSPATH' ) || exit;

/**
 * Loads the Vite-built JS/CSS from build/ and reads its manifest so hashed
 * filenames resolve automatically. Nothing here runs on non-dashboard pages.
 */
class Assets {

	/**
	 * Script/style handle.
	 */
	private const HANDLE = 'wpistic-dashboard';

	/**
	 * Register enqueue hook.
	 */
	public function register(): void {
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue' ) );
	}

	/**
	 * Enqueue assets when this is a dashboard request.
	 */
	public function enqueue(): void {
		if ( ! Router::is_dashboard_request() ) {
			return;
		}

		// Don't let the active theme's styles fight the app shell.
		$this->dequeue_theme_noise();

		$manifest = $this->read_manifest();

		if ( $manifest ) {
			$this->enqueue_built( $manifest );
		} else {
			// Built bundle missing — register an empty handle so localization
			// still attaches and the template can show a build notice.
			wp_register_script( self::HANDLE, '', array(), WPISTIC_DASH_VERSION, true );
			wp_enqueue_script( self::HANDLE );
		}

		// Boot data + design tokens are always present.
		wp_localize_script( self::HANDLE, 'wpisticBoot', ( new BootData() )->build() );

		$tokens = WPISTIC_DASH_PATH . 'assets/tokens.css';
		if ( is_readable( $tokens ) ) {
			wp_enqueue_style( self::HANDLE . '-tokens', WPISTIC_DASH_URL . 'assets/tokens.css', array(), WPISTIC_DASH_VERSION );
		}
	}

	/**
	 * Enqueue the hashed entry chunk + its CSS from the Vite manifest.
	 *
	 * @param array<string,mixed> $manifest Decoded manifest.
	 */
	private function enqueue_built( array $manifest ): void {
		$entry = $manifest['src/app/main.jsx'] ?? reset( $manifest );
		if ( ! $entry ) {
			return;
		}

		$base = WPISTIC_DASH_URL . 'build/';

		wp_enqueue_script(
			self::HANDLE,
			$base . $entry['file'],
			array(),
			WPISTIC_DASH_VERSION,
			true
		);
		// Vite outputs ES modules.
		add_filter(
			'script_loader_tag',
			static function ( $tag, $handle, $src ) {
				if ( self::HANDLE === $handle ) {
					return '<script type="module" src="' . esc_url( $src ) . '" id="' . esc_attr( $handle ) . '-js"></script>';
				}
				return $tag;
			},
			10,
			3
		);

		foreach ( (array) ( $entry['css'] ?? array() ) as $css_file ) {
			wp_enqueue_style( self::HANDLE . '-' . md5( $css_file ), $base . $css_file, array(), WPISTIC_DASH_VERSION );
		}
	}

	/**
	 * Read and decode build/.vite/manifest.json (or build/manifest.json).
	 *
	 * @return array<string,mixed>|null
	 */
	private function read_manifest(): ?array {
		foreach ( array( 'build/.vite/manifest.json', 'build/manifest.json' ) as $rel ) {
			$path = WPISTIC_DASH_PATH . $rel;
			if ( is_readable( $path ) ) {
				$json = json_decode( (string) file_get_contents( $path ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
				if ( is_array( $json ) ) {
					return $json;
				}
			}
		}
		return null;
	}

	/**
	 * Reduce theme/plugin style noise inside the full-screen app.
	 */
	private function dequeue_theme_noise(): void {
		// Allow opt-out via filter.
		if ( ! apply_filters( 'wpistic/dashboard/isolate_styles', true ) ) {
			return;
		}
		remove_action( 'wp_enqueue_scripts', 'wp_enqueue_global_styles' );
		remove_action( 'wp_print_styles', 'print_emoji_styles' );
		add_action( 'wp_print_styles', array( $this, 'maybe_drop_block_library' ), 100 );
	}

	/**
	 * Drop the core block library CSS inside the SPA.
	 */
	public function maybe_drop_block_library(): void {
		wp_dequeue_style( 'wp-block-library' );
		wp_dequeue_style( 'wp-block-library-theme' );
		wp_dequeue_style( 'global-styles' );
		wp_dequeue_style( 'classic-theme-styles' );
	}
}
