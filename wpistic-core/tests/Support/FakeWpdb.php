<?php
/**
 * In-memory stand-in for $wpdb, covering exactly the query shapes used by
 * WPistic's service classes (not a general SQL engine).
 *
 * @package WPistic\Core
 */

namespace WPistic\Core\Tests\Support;

final class FakeWpdb {

	public string $prefix = 'wp_';

	public int $insert_id = 0;

	/**
	 * @var array<string,array<int,array<string,mixed>>>
	 */
	public array $tables = array();

	private int $next_id = 1;

	/**
	 * Nullable columns per table that a real MySQL row would report as
	 * NULL when not supplied — WPistic's service hydrate() methods read
	 * these keys unconditionally, matching a real dbDelta-created table.
	 *
	 * @var array<string,array<int,string>>
	 */
	private array $nullable_defaults = array(
		'wpistic_websites' => array( 'name', 'connector_version', 'token_hash', 'last_seen_at', 'meta' ),
		'wpistic_api_keys' => array( 'scopes', 'last_used_at', 'revoked_at' ),
	);

	/**
	 * @param array<string,mixed> $data
	 * @param mixed                $format
	 */
	public function insert( string $table, array $data, $format = null ): int {
		$id      = $this->next_id++;
		$suffix  = preg_replace( '/^' . preg_quote( $this->prefix, '/' ) . '/', '', $table );
		$defaults = array_fill_keys( $this->nullable_defaults[ $suffix ] ?? array(), null );

		$this->tables[ $table ][ $id ] = array_merge( array( 'id' => $id ), $defaults, $data );
		$this->insert_id               = $id;
		return 1;
	}

	/**
	 * @param array<string,mixed> $data
	 * @param array<string,mixed> $where
	 * @param mixed                $format
	 * @param mixed                $where_format
	 */
	public function update( string $table, array $data, array $where, $format = null, $where_format = null ): int {
		$count = 0;
		foreach ( $this->tables[ $table ] ?? array() as $id => $row ) {
			if ( $this->matches( $row, $where ) ) {
				$this->tables[ $table ][ $id ] = array_merge( $row, $data );
				++$count;
			}
		}
		return $count;
	}

	/**
	 * @param array<string,mixed> $where
	 * @param mixed                $format
	 */
	public function delete( string $table, array $where, $format = null ): int {
		$count = 0;
		foreach ( $this->tables[ $table ] ?? array() as $id => $row ) {
			if ( $this->matches( $row, $where ) ) {
				unset( $this->tables[ $table ][ $id ] );
				++$count;
			}
		}
		return $count;
	}

	/**
	 * @return array{query:string,args:array<int,mixed>}
	 */
	public function prepare( string $query, ...$args ) {
		return array(
			'query' => $query,
			'args'  => $args,
		);
	}

	/**
	 * @param array{query:string,args:array<int,mixed>}|string $prepared
	 * @param mixed                                              $output
	 * @return array<int,array<string,mixed>>
	 */
	public function get_results( $prepared, $output = null ): array {
		return array_values( $this->run( $prepared ) );
	}

	/**
	 * @param array{query:string,args:array<int,mixed>}|string $prepared
	 * @param mixed                                              $output
	 * @return array<string,mixed>|null
	 */
	public function get_row( $prepared, $output = null ) {
		$rows = $this->run( $prepared );
		return $rows ? array_values( $rows )[0] : null;
	}

	/**
	 * @param array{query:string,args:array<int,mixed>}|string $prepared
	 * @return mixed
	 */
	public function get_var( $prepared ) {
		$rows = $this->run( $prepared );
		if ( ! $rows ) {
			return null;
		}
		$first = array_values( $rows )[0];
		return reset( $first );
	}

	/**
	 * @param array<string,mixed> $row
	 * @param array<string,mixed> $where
	 */
	private function matches( array $row, array $where ): bool {
		foreach ( $where as $key => $value ) {
			if ( ! array_key_exists( $key, $row ) || (string) $row[ $key ] !== (string) $value ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Route a prepared query to the matching in-memory lookup. Every branch
	 * corresponds 1:1 to a query literal in wpistic-core's service classes.
	 *
	 * @param array{query:string,args:array<int,mixed>}|string $prepared
	 * @return array<int,array<string,mixed>>
	 */
	private function run( $prepared ): array {
		if ( is_array( $prepared ) ) {
			$query = $prepared['query'];
			$args  = $prepared['args'];
		} else {
			$query = $prepared;
			$args  = array();
		}

		$websites   = $this->prefix . 'wpistic_websites';
		$api_keys   = $this->prefix . 'wpistic_api_keys';
		$workspaces = $this->prefix . 'wpistic_workspaces';
		$members    = $this->prefix . 'wpistic_workspace_members';

		// WorkspaceService::get_for_user — join workspaces + active membership.
		if ( str_contains( $query, 'INNER JOIN' ) && str_contains( $query, $members ) ) {
			[$user_id] = $args;
			$rows      = array();
			foreach ( $this->tables[ $members ] ?? array() as $member ) {
				if ( (int) $member['user_id'] === (int) $user_id && 'active' === $member['status'] ) {
					$workspace = $this->tables[ $workspaces ][ $member['workspace_id'] ] ?? null;
					if ( $workspace ) {
						$rows[] = array_merge(
							$workspace,
							array(
								'member_role'   => $member['role'],
								'member_status' => $member['status'],
							)
						);
					}
				}
			}
			usort( $rows, static fn( $a, $b ) => $a['id'] <=> $b['id'] );
			return $rows;
		}

		// WorkspaceService::user_can_access — active-membership role lookup.
		if ( str_contains( $query, 'SELECT role FROM' ) ) {
			[$user_id, $workspace_id] = $args;
			foreach ( $this->tables[ $members ] ?? array() as $member ) {
				if ( (int) $member['user_id'] === (int) $user_id
					&& (int) $member['workspace_id'] === (int) $workspace_id
					&& 'active' === $member['status']
				) {
					return array( array( 'role' => $member['role'] ) );
				}
			}
			return array();
		}

		// ApiKeyService::regenerate — fetch label/scopes scoped to a workspace.
		if ( str_contains( $query, 'SELECT label, scopes FROM' ) ) {
			[$id, $workspace_id] = $args;
			$row                 = $this->tables[ $api_keys ][ $id ] ?? null;
			if ( $row && (int) $row['workspace_id'] === (int) $workspace_id ) {
				return array(
					array(
						'label'  => $row['label'],
						'scopes' => $row['scopes'],
					),
				);
			}
			return array();
		}

		// ApiKeyService::list_for_workspace.
		if ( str_contains( $query, $api_keys ) && str_contains( $query, 'workspace_id' ) ) {
			[$workspace_id] = $args;
			$rows           = array_values(
				array_filter(
					$this->tables[ $api_keys ] ?? array(),
					static fn( $r ) => (int) $r['workspace_id'] === (int) $workspace_id
				)
			);
			usort( $rows, static fn( $a, $b ) => strcmp( $b['created_at'], $a['created_at'] ) );
			return $rows;
		}

		// WorkspaceService::unique_slug — slug lookup.
		if ( str_contains( $query, 'SELECT id FROM' ) && str_contains( $query, $workspaces ) ) {
			[$slug] = $args;
			foreach ( $this->tables[ $workspaces ] ?? array() as $ws ) {
				if ( $ws['slug'] === $slug ) {
					return array( array( 'id' => $ws['id'] ) );
				}
			}
			return array();
		}

		// WebsiteService::get — single row by id.
		if ( str_contains( $query, $websites ) && str_contains( $query, 'WHERE id = %d' ) ) {
			[$id] = $args;
			$row  = $this->tables[ $websites ][ $id ] ?? null;
			return $row ? array( $row ) : array();
		}

		// WebsiteService::list_for_workspace.
		if ( str_contains( $query, $websites ) && str_contains( $query, 'workspace_id' ) ) {
			[$workspace_id] = $args;
			$rows           = array_values(
				array_filter(
					$this->tables[ $websites ] ?? array(),
					static fn( $r ) => (int) $r['workspace_id'] === (int) $workspace_id
				)
			);
			usort( $rows, static fn( $a, $b ) => strcmp( $b['created_at'], $a['created_at'] ) );
			return $rows;
		}

		throw new \RuntimeException( "FakeWpdb: unrecognized query shape: {$query}" );
	}
}
