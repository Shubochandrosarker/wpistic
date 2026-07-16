<?php
/**
 * Builds a ServiceContainer wired with real service instances (backed by
 * whatever $wpdb is currently set as the global), for REST controller tests.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Support;

use WPistic\Core\Support\ServiceContainer;
use WPistic\Core\Services\WorkspaceService;
use WPistic\Core\Services\WebsiteService;
use WPistic\Core\Services\ActivityService;
use WPistic\Core\Services\ApiKeyService;
use WPistic\Core\Services\DashboardService;
use WPistic\Core\Integrations\IntegrationRegistry;

final class TestServices {

	public static function container(): ServiceContainer {
		$container = new ServiceContainer();

		$container->singleton( WorkspaceService::class, static fn() => new WorkspaceService() );
		$container->singleton(
			WebsiteService::class,
			static fn( $c ) => new WebsiteService( $c->get( WorkspaceService::class ) )
		);
		$container->singleton( ActivityService::class, static fn() => new ActivityService() );
		$container->singleton( ApiKeyService::class, static fn() => new ApiKeyService() );
		$container->singleton( IntegrationRegistry::class, static fn() => new IntegrationRegistry() );
		$container->singleton(
			DashboardService::class,
			static fn( $c ) => new DashboardService(
				$c->get( WorkspaceService::class ),
				$c->get( WebsiteService::class ),
				$c->get( ActivityService::class ),
				$c->get( IntegrationRegistry::class )
			)
		);

		return $container;
	}
}
