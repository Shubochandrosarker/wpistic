import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth';
import { Card } from '../components/ui';

export function AcceptInvitation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentOrg = useAuthStore((s) => s.setCurrentOrg);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get('token');
    if (!token) {
      setError('Invitation link is missing its token.');
      return;
    }
    api
      .request<{ organization_id: string }>(`/invitations/accept`, {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
      .then(async ({ organization_id }) => {
        await queryClient.invalidateQueries({ queryKey: ['me'] });
        const result = await api.switchOrg(organization_id);
        setCurrentOrg(organization_id, result.access_token);
        navigate('/', { replace: true });
      })
      .catch((err: Error) => setError(err.message));
  }, [params, navigate, queryClient, setCurrentOrg]);

  return (
    <div className="grid place-items-center py-24">
      <Card className="p-8 max-w-sm text-center">
        {error ? (
          <>
            <h1 className="font-semibold mb-2">Invitation problem</h1>
            <p className="text-sm text-muted">{error}</p>
          </>
        ) : (
          <p className="text-sm text-muted">Joining organization…</p>
        )}
      </Card>
    </div>
  );
}
