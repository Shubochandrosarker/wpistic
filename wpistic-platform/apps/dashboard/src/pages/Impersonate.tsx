import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

/**
 * Entry point for admin impersonation handoff from admin.wpistic.com.
 * The 30-minute restricted token arrives in the URL fragment (never sent to
 * any server), is loaded into memory, and the banner in Layout takes over.
 */
export function Impersonate() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token');
    window.history.replaceState(null, '', '/auth/impersonate');
    if (token) {
      setTokens(token);
      navigate('/', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate, setTokens]);

  return (
    <div className="min-h-screen grid place-items-center">
      <p className="text-sm text-muted">Starting support session…</p>
    </div>
  );
}
