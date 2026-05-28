<?php
/**
 * Bookingistic + WPistic Contact Form adapter.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Integrations;

defined( 'ABSPATH' ) || exit;

/**
 * Talks to Bookingistic (appointments / demo requests) and the
 * WPistic Contact Form plugin (contact, support, sales forms).
 *
 * The theme renders forms via shortcodes/blocks provided by these
 * plugins; this adapter only reports availability so templates can
 * decide whether to render the real form or a graceful fallback.
 */
class BookingisticAdapter extends AbstractAdapter {

	public function slug(): string {
		return 'bookingistic';
	}

	public function is_available(): bool {
		return function_exists( 'bookingistic' )
			|| defined( 'BOOKINGISTIC_VERSION' )
			|| class_exists( '\\Bookingistic\\Plugin' );
	}

	/**
	 * Whether the WPistic Contact Form plugin is active.
	 */
	public function has_contact_form(): bool {
		return function_exists( 'wpistic_contact_form' )
			|| defined( 'WPISTIC_CONTACT_FORM_VERSION' );
	}

	/**
	 * Resolve the shortcode for a given form context, when available.
	 *
	 * @param string $context contact|demo|support|booking.
	 */
	public function form_shortcode( string $context ): string {
		$map = apply_filters(
			'wpistic/forms/shortcodes',
			array(
				'contact' => '[wpistic_contact_form]',
				'support' => '[wpistic_contact_form id="support"]',
				'demo'    => '[bookingistic_form type="demo"]',
				'booking' => '[bookingistic]',
			)
		);
		return (string) ( $map[ $context ] ?? '' );
	}
}
