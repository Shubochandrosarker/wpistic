<?php
/**
 * Tests for WPistic\Core\Database\Schema — the dbDelta-based table
 * install/migration runner.
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Unit\Database;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WPistic\Core\Database\Schema;
use WPistic\Core\Database\Tables;
use WPistic\Core\Tests\Support\FakeWpdb;

final class SchemaTest extends TestCase {

	private FakeWpdb $wpdb;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		global $wpdb;
		$wpdb       = new FakeWpdb();
		$this->wpdb = $wpdb;

		$GLOBALS['wpistic_test_dbdelta_calls'] = array();
	}

	protected function tearDown(): void {
		unset( $GLOBALS['wpistic_test_dbdelta_calls'] );
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_install_runs_dbdelta_for_every_managed_table(): void {
		Schema::install();

		$calls = $GLOBALS['wpistic_test_dbdelta_calls'];
		$this->assertCount( 5, $calls );

		$sql = implode( "\n", array_map( static fn( $call ) => implode( "\n", $call ), $calls ) );
		foreach ( Tables::all() as $table ) {
			$this->assertStringContainsString( $this->wpdb->prefix . $table, $sql );
		}
	}

	public function test_maybe_upgrade_installs_and_bumps_the_version_when_stale(): void {
		Functions\when( 'get_option' )->justReturn( '0.9.0' );
		$updated = array();
		Functions\when( 'update_option' )->alias(
			function ( $key, $value, $autoload = true ) use ( &$updated ) {
				$updated[] = array( $key, $value, $autoload );
				return true;
			}
		);

		Schema::maybe_upgrade();

		$this->assertNotEmpty( $GLOBALS['wpistic_test_dbdelta_calls'] );
		$this->assertSame( array( array( 'wpistic_core_db_version', '1.0.0', false ) ), $updated );
	}

	public function test_maybe_upgrade_is_a_no_op_when_already_current(): void {
		Functions\when( 'get_option' )->justReturn( '1.0.0' );
		Functions\when( 'update_option' )->alias(
			static function () {
				throw new \RuntimeException( 'update_option should not be called when already current' );
			}
		);

		Schema::maybe_upgrade();

		$this->assertSame( array(), $GLOBALS['wpistic_test_dbdelta_calls'] );
	}

	public function test_maybe_upgrade_is_idempotent_across_repeated_calls(): void {
		$version = null;
		Functions\when( 'get_option' )->alias( static function () use ( &$version ) {
			return $version;
		} );
		Functions\when( 'update_option' )->alias(
			static function ( $key, $value ) use ( &$version ) {
				$version = $value;
				return true;
			}
		);

		Schema::maybe_upgrade();
		$first_run_calls = count( $GLOBALS['wpistic_test_dbdelta_calls'] );

		Schema::maybe_upgrade();
		$second_run_calls = count( $GLOBALS['wpistic_test_dbdelta_calls'] );

		$this->assertGreaterThan( 0, $first_run_calls );
		$this->assertSame( $first_run_calls, $second_run_calls );
	}
}
