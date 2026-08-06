/**
 * Entry-point and fallback routes.
 *
 * The SPA owns only its authenticated routes; sign-in and sign-up live on the
 * identity service. Without the redirects below, anything else — a stale
 * bookmark, a mistyped path, a link written against the old `/dashboard`
 * prefix — matched no route at all and React Router rendered nothing, so the
 * visitor got a blank white page with no way to recover.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ACCOUNT_URL } from '../lib/config';
import { redirectToLogin } from '../stores/auth';
import { Button } from '../components/ui';

function Redirecting({ message }: { message: string }) {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

/**
 * `/login` — kick off the OAuth flow. Reachable from old marketing links and
 * from anyone who typed it expecting a login form.
 */
export function LoginRedirect() {
  useEffect(() => {
    redirectToLogin('/');
  }, []);
  return <Redirecting message="Taking you to sign in…" />;
}

/**
 * `/register` — account creation belongs to the identity service; the SPA has
 * no way to do it. A full page assignment, not a router navigation, because
 * this leaves the app entirely.
 */
export function RegisterRedirect() {
  useEffect(() => {
    window.location.assign(`${ACCOUNT_URL}/register`);
  }, []);
  return <Redirecting message="Taking you to sign up…" />;
}

/**
 * Anything else inside the authenticated app. Rendered within the layout, so
 * the sidebar is still there and the visitor is one click from somewhere real.
 */
export function NotFound() {
  return (
    <div className="max-w-md">
      <h1 className="text-xl font-semibold mb-2">Page not found</h1>
      <p className="text-sm text-muted mb-5">
        That page does not exist in your dashboard. It may have moved, or the link may be out of date.
      </p>
      <Link to="/">
        <Button>Back to overview</Button>
      </Link>
    </div>
  );
}
