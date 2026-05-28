<?php
/**
 * Registers every REST controller.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\REST;

use WPistic\Core\Support\ServiceContainer;

defined( 'ABSPATH' ) || exit;

/**
 * Wires up first-party controllers plus guarded fallbacks for the
 * memberistic / licenseistic / wpistic-auth namespaces.
 */
class RestServiceProvider {

	/**
	 * Service container.
	 *
	 * @var ServiceContainer
	 */
	private ServiceContainer $container;

	/**
	 * Constructor.
	 *
	 * @param ServiceContainer $container Service container.
	 */
	public function __construct( ServiceContainer $container ) {
		$this->container = $container;
	}

	/**
	 * Register all controllers on rest_api_init.
	 */
	public function register(): void {
		$controllers = array(
			// First-party wpistic/v1.
			new MeController( $this->container ),
			new WorkspaceController( $this->container ),
			new DashboardController( $this->container ),
			new ProductsController( $this->container ),
			new WebsitesController( $this->container ),
			new ActivityController( $this->container ),
			new DevelopersController( $this->container ),
			// Guarded fallbacks (only register routes the real plugin hasn't).
			new MemberisticController( $this->container ),
			new LicenseisticController( $this->container ),
			new AuthController( $this->container ),
		);

		foreach ( $controllers as $controller ) {
			$controller->register_routes();
		}
	}
}
