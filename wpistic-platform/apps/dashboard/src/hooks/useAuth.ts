import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, redirectToLogin } from '../stores/auth';
import { api } from '../lib/api-client';

/** Boot the session once on app mount (refresh-token exchange). */
export function useAuthBoot(): void {
  const status = useAuthStore((s) => s.status);
  const boot = useAuthStore((s) => s.boot);
  useEffect(() => {
    if (status === 'booting') void boot();
  }, [status, boot]);
}

/** Load /me once authenticated and hydrate identity + org list. */
export function useIdentity() {
  const status = useAuthStore((s) => s.status);
  const setIdentity = useAuthStore((s) => s.setIdentity);

  const query = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.data) setIdentity(query.data.user, query.data.organizations);
  }, [query.data, setIdentity]);

  return query;
}

export function useCurrentOrg() {
  const organizations = useAuthStore((s) => s.organizations);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  return organizations.find((o) => o.id === currentOrgId) ?? null;
}

export function useSwitchOrg() {
  const queryClient = useQueryClient();
  const setCurrentOrg = useAuthStore((s) => s.setCurrentOrg);
  return async (orgId: string) => {
    const result = await api.switchOrg(orgId);
    setCurrentOrg(orgId, result.access_token);
    await queryClient.invalidateQueries();
  };
}

export { redirectToLogin };
