import { useQuery } from '@tanstack/react-query';
import type { EntitlementValue } from '@wpistic/types';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth';

export function useEntitlements(product?: string) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const query = useQuery({
    queryKey: ['entitlements', orgId, product ?? 'all'],
    queryFn: () => api.getEntitlements(orgId!, product),
    enabled: orgId !== null,
    staleTime: 60_000,
  });

  const entitlements = query.data?.entitlements ?? {};

  return {
    ...query,
    entitlements,
    /** entitlements.allows('chatbotistic.white_label') — never check plan names. */
    allows(key: string): boolean {
      return entitlements[key] === true;
    },
    limit(key: string): number {
      const value: EntitlementValue | undefined = entitlements[key];
      return typeof value === 'number' ? value : 0;
    },
  };
}
