<?php
/**
 * REST controller for the wpistic-auth/v1 namespace — login, register,
 * logout, status. Uses WordPress's own secure primitives (wp_authenticate,
 * wp_set_auth_cookie, wp_insert_user) rather than custom crypto.
 *
 * @package WPistic\Auth
 */

namespace WPistic\Auth\REST;

use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * Owns the wpistic-auth/v1 namespace.
   */
class AuthController {

	private const NAMESPACE = 'wpistic-auth/v1';

	/**
	 * Hook into rest_api_init.
  	 */
	public function register(): void {
    		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
  }

	/**
	 * Register all auth routes.
  	 */
	public function register_routes(): void {
    		register_rest_route(
          			self::NAMESPACE,
          			'/status',
          			array(
                  				'methods'             => 'GET',
                  				'callback'            => array( $this, 'status' ),
                  				'permission_callback' => '__return_true',
                  			)
          		);

  		register_rest_route(
        			self::NAMESPACE,
        			'/login',
        			array(
                				'methods'             => 'POST',
                				'callback'            => array( $this, 'login' ),
                				'permission_callback' => '__return_true',
                			)
        		);

  		register_rest_route(
        			self::NAMESPACE,
        			'/register',
        			array(
                				'methods'             => 'POST',
                				'callback'            => array( $this, 'register_user' ),
                				'permission_callback' => '__return_true',
                			)
        		);

  		register_rest_route(
        			self::NAMESPACE,
        			'/logout',
        			array(
                				'methods'             => 'POST',
                				'callback'            => array( $this, 'logout' ),
                				'permission_callback' => 'is_user_logged_in',
                			)
        		);
  }

	/**
	 * GET /status — capability probe.
  	 */
	public function status(): WP_REST_Response {
    		return new WP_REST_Response(
          			array(
                  				'auth_plugin'  => true,
                  				'supports_jwt' => false,
                  				'logged_in'    => is_user_logged_in(),
                  			),
          			200
          		);
  }

	/**
	 * POST /login.
  	 *
  	 * @param WP_REST_Request $request Request.
  	 */
	public function login( WP_REST_Request $request ): WP_REST_Response {
    		if ( ! $this->verify_nonce( $request ) ) {
          			return new WP_REST_Response( array( 'message' => __( 'Your session expired. Please refresh the page and try again.', 'wpistic-auth-flow' ) ), 403 );
        }

  		if ( ! $this->rate_limit( 'login', 8, 10 * MINUTE_IN_SECONDS ) ) {
        			return new WP_REST_Response( array( 'message' => __( 'Too many attempts. Please wait a few minutes and try again.', 'wpistic-auth-flow' ) ), 429 );
      }

  		$identifier = sanitize_text_field( (string) $request->get_param( 'identifier' ) );
    		$password   = (string) $request->get_param( 'password' );

  		if ( '' === $identifier || '' === $password ) {
        			return new WP_REST_Response( array( 'message' => __( 'Please enter your email/username and password.', 'wpistic-auth-flow' ) ), 400 );
      }

  		$user = wp_authenticate( $identifier, $password );

  		if ( is_wp_error( $user ) ) {
        			return new WP_REST_Response( array( 'message' => __( 'Incorrect email/username or password.', 'wpistic-auth-flow' ) ), 401 );
      }

  		wp_set_current_user( $user->ID );
    		wp_set_auth_cookie( $user->ID, true );

  		/** This action is documented in wp-includes/user.php */
  		do_action( 'wp_login', $user->user_login, $user );

  		return new WP_REST_Response(
        			array(
                				'success'  => true,
                				'redirect' => home_url( '/dashboard' ),
                			),
        			200
        		);
  }

	/**
	 * POST /register.
  	 *
  	 * @param WP_REST_Request $request Request.
  	 */
	public function register_user( WP_REST_Request $request ): WP_REST_Response {
    		if ( ! $this->verify_nonce( $request ) ) {
          			return new WP_REST_Response( array( 'message' => __( 'Your session expired. Please refresh the page and try again.', 'wpistic-auth-flow' ) ), 403 );
        }

  		if ( ! $this->rate_limit( 'register', 5, HOUR_IN_SECONDS ) ) {
        			return new WP_REST_Response( array( 'message' => __( 'Too many attempts. Please try again later.', 'wpistic-auth-flow' ) ), 429 );
      }

  		$name     = sanitize_text_field( (string) $request->get_param( 'name' ) );
    		$email    = sanitize_email( (string) $request->get_param( 'email' ) );
    		$password = (string) $request->get_param( 'password' );

  		if ( '' === $name || '' === $email || '' === $password ) {
        			return new WP_REST_Response( array( 'message' => __( 'Name, email, and password are required.', 'wpistic-auth-flow' ) ), 400 );
      }
    		if ( ! is_email( $email ) ) {
          			return new WP_REST_Response( array( 'message' => __( 'Please enter a valid email address.', 'wpistic-auth-flow' ) ), 400 );
        }
    		if ( email_exists( $email ) ) {
          			return new WP_REST_Response( array( 'message' => __( 'An account with this email already exists.', 'wpistic-auth-flow' ) ), 409 );
        }
    		if ( strlen( $password ) < 8 ) {
          			return new WP_REST_Response( array( 'message' => __( 'Password must be at least 8 characters.', 'wpistic-auth-flow' ) ), 400 );
        }

  		$username = $this->unique_username_from_email( $email );

  		$user_id = wp_insert_user(
        			array(
                				'user_login'   => $username,
                				'user_email'   => $email,
                				'user_pass'    => $password,
                				'display_name' => $name,
                				'first_name'   => $name,
                				'role'         => 'subscriber',
                			)
        		);

  		if ( is_wp_error( $user_id ) ) {
        			return new WP_REST_Response( array( 'message' => $user_id->get_error_message() ), 400 );
      }

  		/**
    		 * Fires after a new WPistic account is created via /register.
        		 *
        		 * @param int $user_id Newly created user id.
        		 */
        		do_action( 'wpistic_auth/user_registered', $user_id );

  		wp_set_current_user( $user_id );
    		wp_set_auth_cookie( $user_id, true );

  		/** This action is documented in wp-includes/user.php */
        		do_action( 'wp_login', $username, get_user_by( 'id', $user_id ) );

  		return new WP_REST_Response(
        			array(
                				'success'  => true,
                				'redirect' => home_url( '/dashboard' ),
                			),
        			200
        		);
  }

	/**
	 * POST /logout.
  	 *
  	 * @param WP_REST_Request $request Request.
  	 */
	public function logout( WP_REST_Request $request ): WP_REST_Response {
    		if ( ! $this->verify_nonce( $request ) ) {
          			return new WP_REST_Response( array( 'message' => __( 'Invalid request.', 'wpistic-auth-flow' ) ), 403 );
        }
    		wp_logout();
    		return new WP_REST_Response( array( 'logged_out' => true ), 200 );
  }

	/**
	 * Verify the wp_rest nonce sent with the request.
  	 *
  	 * @param WP_REST_Request $request Request.
  	 */
  	private function verify_nonce( WP_REST_Request $request ): bool {
  		$nonce = $request->get_header( 'X-WP-Nonce' );
  		if ( ! $nonce ) {
        			$nonce = (string) $request->get_param( '_wpnonce' );
      }
  		return (bool) wp_verify_nonce( $nonce, 'wp_rest' );
}

	/**
	 * Simple per-IP rate limiter backed by transients.
    	 *
    	 * @param string $bucket Bucket name.
    	 * @param int    $max    Max attempts within the window.
    	 * @param int    $window Window length in seconds.
    	 */
    	private function rate_limit( string $bucket, int $max, int $window ): bool {
        		$key   = 'wpistic_auth_rl_' . $bucket . '_' . md5( $this->client_ip() );
        		$count = (int) get_transient( $key );
        		if ( $count >= $max ) {
              			return false;
            }
        		set_transient( $key, $count + 1, $window );
        		return true;
      }

    	/**
    	 * Best-effort client IP resolution.
    	 */
    	private function client_ip(): string {
        		foreach ( array( 'HTTP_X_FORWARDED_FOR', 'HTTP_CLIENT_IP', 'REMOTE_ADDR' ) as $key ) {
              			if ( ! empty( $_SERVER[ $key ] ) ) {
                      				$parts = explode( ',', sanitize_text_field( wp_unslash( $_SERVER[ $key ] ) ) );
                      				return trim( $parts[0] );
                    }
            }
        		return '0.0.0.0';
      }

	/**
	 * Derive a unique WordPress username from an email address.
    	 *
    	 * @param string $email Email address.
    	 */
    	private function unique_username_from_email( string $email ): string {
        		$base     = sanitize_user( current( explode( '@', $email ) ), true );
        		$base     = $base ? $base : 'user';
        		$username = $base;
        		$i        = 1;
        		while ( username_exists( $username ) ) {
              			$username = $base . $i;
              			++$i;
            }
        		return $username;
      }
    }
