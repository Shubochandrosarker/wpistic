<?php
/**
 * Tests for WPistic\Core\Activator::register_roles() — idempotent role and
 * capability setup that runs on every plugin activation.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\Activator;
use WPistic\Core\Tests\Support\FakeWpRole;

final class ActivatorTest extends TestCase {

	/**
	 * @var array<string,FakeWpRole|null>
	 */
	private array $roles = array();

	/**
	 * @var array<int,array{0:string,1:string,2:array<string,bool>}>
	 */
	private array $added_roles = array();

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->roles       = array();
		$this->added_roles = array();

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'get_role' )->alias(
			function ( $slug ) {
				return $this->roles[ $slug ] ?? null;
			}
		);
		Functions\when( 'add_role' )->alias(
			function ( $slug, $display_name, $caps ) {
				$this->added_roles[] = array( $slug, $display_name, $caps );
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_creates_the_wpistic_member_role_when_absent(): void {
		$this->roles['wpistic_member'] = null;
		$this->roles['administrator']  = new FakeWpRole();

		Activator::register_roles();

		$this->assertCount( 1, $this->added_roles );
		[$slug, , $caps] = $this->added_roles[0];
		$this->assertSame( 'wpistic_member', $slug );
		$this->assertTrue( $caps['read'] );
		foreach ( Activator::capabilities() as $cap ) {
			$this->assertTrue( $caps[ $cap ] );
		}
	}

	public function test_does_not_recreate_the_role_when_it_already_exists(): void {
		$this->roles['wpistic_member'] = new FakeWpRole( array( 'read' => true ) );
		$this->roles['administrator']  = new FakeWpRole();

		Activator::register_roles();

		$this->assertSame( array(), $this->added_roles );
	}

	public function test_grants_every_missing_capability_to_administrator(): void {
		$this->roles['wpistic_member'] = new FakeWpRole();
		$admin                         = new FakeWpRole();
		$this->roles['administrator']  = $admin;

		Activator::register_roles();

		$this->assertSame( Activator::capabilities(), $admin->added_caps );
	}

	public function test_skips_capabilities_administrator_already_has(): void {
		$this->roles['wpistic_member'] = new FakeWpRole();
		$admin                         = new FakeWpRole( array_fill_keys( Activator::capabilities(), true ) );
		$this->roles['administrator']  = $admin;

		Activator::register_roles();

		$this->assertSame( array(), $admin->added_caps );
	}

	public function test_grants_only_the_missing_capabilities_when_partially_configured(): void {
		$this->roles['wpistic_member'] = new FakeWpRole();
		$admin                         = new FakeWpRole( array( 'wpistic_access_dashboard' => true ) );
		$this->roles['administrator']  = $admin;

		Activator::register_roles();

		$this->assertNotContains( 'wpistic_access_dashboard', $admin->added_caps );
		$this->assertContains( 'wpistic_manage_billing', $admin->added_caps );
	}

	public function test_does_not_throw_when_the_administrator_role_is_missing(): void {
		$this->roles['wpistic_member'] = new FakeWpRole();
		$this->roles['administrator']  = null;

		Activator::register_roles();

		$this->addToAssertionCount( 1 ); // Reaching here without a fatal is the assertion.
	}
}
