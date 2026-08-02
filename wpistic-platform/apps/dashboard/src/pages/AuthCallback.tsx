import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeLogin } from '@wpistic/auth-sdk';
import { authConfig } from '../lib/config';
import { useAuthStore } from '../stores/auth';
import { Button, Card } from '../components/ui';
import { redirectToLogin } from '../hooks/useAuth';

export function AuthCallback() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-invoke guard — codes are single-use
    ran.current = true;
    completeLogin(authConfig)
      .then(({ tokens, returnTo }) => {
        setTokens(tokens.access_token);
        navigate(returnTo === '/auth/callback' ? '/' : returnTo, { replace: true });
      })
      .catch((err: Error) => setError(err.message));
  }, [navigate, setTokens]);

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <Card className="p-8 max-w-sm text-center">
          <h1 className="font-semibold mb-2">Sign-in failed</h1>
          <p className="text-sm text-muted mb-5">{error}</p>
          <Button onClick={() => redirectToLogin('/')}>Try again</Button>
        </Card>
      </div>
    );
  }
  return (
    <div className="min-h-screen grid place-items-center">
      <p className="text-sm text-muted">Completing sign-in…</p>
    </div>
  );
}
