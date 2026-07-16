<?php
/**
 * Tests for WPistic\Core\REST\RestServiceProvider.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\REST;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\REST\RestServiceProvider;
use WPistic\Core\Integrations\IntegrationRegistry;
use WPistic\Core\Support\ServiceContainer;

final class RestServiceProviderTest extends TestCase {

	/**
	 * @var array<int,array{0:string,1:string}>
	 */
	private array $registered = array();

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->registered = array();

		Functions\when( 'register_rest_route' )->alias(
			function ( $namespace, $route ) {
				$this->registered[] = array( $namespace, $route );
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function container(): ServiceContainer {
		$container = new ServiceContainer();
		$container->singleton( IntegrationRegistry::class, static fn() => new IntegrationRegistry() );
		return $container;
	}

	public function test_registers_every_first_party_and_guarded_fallback_route(): void {
		// No sibling plugin has registered anything, so every guarded
		// fallback route in Memberistic/Licenseistic/Auth also registers.
		Functions\when( 'rest_get_server' )->justReturn(
			new class() {
				public function get_routes( $namespace = '' ) {
					return array();
				}
			}
		);

		( new RestServiceProvider( $this->container() ) )->register();

		$this->assertContains( array( 'wpistic/v1', '/me' ), $this->registered );
		$this->assertContains( array( 'wpistic/v1', '/workspace' ), $this->registered );
		$this->assertContains( array( 'wpistic/v1', '/dashboard' ), $this->registered );
		$this->assertContains( array( 'wpistic/v1', '/products' ), $this->registered );
		$this->assertContains( array( 'wpistic/v1', '/websites' ), $this->registered );
		$this->assertContains( array( 'wpistic/v1', '/websites/(?P<id>\d+)' ), $this->registered );
		$this->assertContains( array( 'wpistic/v1', '/activity' ), $this->registered );
		$this->assertContains( array( 'wpistic/v1', '/api-keys' ), $this->registered );
		$this->assertContains( array( 'wpistic/v1', '/api-keys/(?P<id>\d+)' ), $this->registered );
		$this->assertContains( array( 'wpistic/v1', '/api-keys/(?P<id>\d+)/regenerate' ), $this->registered );

		$this->assertContains( array( 'memberistic/v1', '/plans' ), $this->registered );
		$this->assertContains( array( 'memberistic/v1', '/subscription' ), $this->registered );
		$this->assertContains( array( 'memberistic/v1', '/billing' ), $this->registered );
		$this->assertContains( array( 'memberistic/v1', '/invoices' ), $this->registered );

		$this->assertContains( array( 'licenseistic/v1', '/licenses' ), $this->registered );
		$this->assertContains( array( 'licenseistic/v1', '/downloads' ), $this->registered );
		$this->assertContains( array( 'licenseistic/v1', '/activate' ), $this->registered );
		$this->assertContains( array( 'licenseistic/v1', '/deactivate' ), $this->registered );
		$this->assertContains( array( 'licenseistic/v1', '/validate' ), $this->registered );

		$this->assertContains( array( 'wpistic-auth/v1', '/status' ), $this->registered );
		$this->assertContains( array( 'wpistic-auth/v1', '/logout' ), $this->registered );
	}

	public function test_does_not_re_register_a_guarded_route_a_sibling_plugin_already_owns(): void {
		Functions\when( 'rest_get_server' )->justReturn(
			new class() {
				public function get_routes( $namespace = '' ) {
					return array( '/memberistic/v1/plans' => array() );
				}
			}
		);

		( new RestServiceProvider( $this->container() ) )->register();

		$this->assertNotContains( array( 'memberistic/v1', '/plans' ), $this->registered );
		// Sibling ownership is checked per-route — the other three still register.
		$this->assertContains( array( 'memberistic/v1', '/subscription' ), $this->registered );
	}
}
