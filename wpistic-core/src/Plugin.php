<?php
/**
 * Core plugin bootstrap / service container.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core;

use WPistic\Core\Database\Schema;
use WPistic\Core\Support\ServiceContainer;
use WPistic\Core\Integrations\IntegrationRegistry;
use WPistic\Core\Services\WorkspaceService;
use WPistic\Core\Services\WebsiteService;
use WPistic\Core\Services\ActivityService;
use WPistic\Core\Services\ApiKeyService;
use WPistic\Core\Services\DashboardService;
use WPistic\Core\REST\RestServiceProvider;

defined( 'ABSPATH' ) || exit;

/**
 * Main plugin singleton.
 */
final class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var Plugin|null
	 */
	private static ?Plugin $instance = null;

	/**
	 * Service container.
	 *
	 * @var ServiceContainer
	 */
	private ServiceContainer $container;

	/**
	 * Whether the plugin has already booted.
	 *
	 * @var bool
	 */
	private bool $booted = false;

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->container = new ServiceContainer();
	}

	/**
	 * Get the shared instance.
	 */
	public static function instance(): Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Service container accessor.
	 */
	public function container(): ServiceContainer {
		return $this->container;
	}

	/**
	 * Convenience accessor for a service.
	 *
	 * @param string $id Service identifier.
	 * @return mixed
	 */
	public function service( string $id ) {
		return $this->container->get( $id );
	}

	/**
	 * Register services and wire up WordPress hooks.
	 */
	public function boot(): void {
		if ( $this->booted ) {
			return;
		}
		$this->booted = true;

		$this->register_services();

		// Integration adapters need to detect sibling plugins after they load.
		add_action( 'init', array( $this->container->get( IntegrationRegistry::class ), 'discover' ), 1 );

		// REST API.
		add_action( 'rest_api_init', array( new RestServiceProvider( $this->container ), 'register' ) );

		// Roles / capabilities are ensured on every load (cheap, idempotent).
		add_action( 'init', array( Activator::class, 'register_roles' ), 0 );

		// Run schema migrations when the version changes (admin context only).
		add_action( 'admin_init', array( Schema::class, 'maybe_upgrade' ) );

		do_action( 'wpistic_core_booted', $this );
	}

	/**
	 * Register the core service bindings.
	 */
	private function register_services(): void {
		$c = $this->container;

		$c->singleton(
			IntegrationRegistry::class,
			static fn() => new IntegrationRegistry()
		);
		$c->singleton(
			WorkspaceService::class,
			static fn() => new WorkspaceService()
		);
		$c->singleton(
			WebsiteService::class,
			static fn( $c ) => new WebsiteService( $c->get( WorkspaceService::class ) )
		);
		$c->singleton(
			ActivityService::class,
			static fn() => new ActivityService()
		);
		$c->singleton(
			ApiKeyService::class,
			static fn() => new ApiKeyService()
		);
		$c->singleton(
			DashboardService::class,
			static fn( $c ) => new DashboardService(
				$c->get( WorkspaceService::class ),
				$c->get( WebsiteService::class ),
				$c->get( ActivityService::class ),
				$c->get( IntegrationRegistry::class )
			)
		);
	}
}
