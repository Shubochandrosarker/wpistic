/**
 * TanStack Query hooks over the platform SDK, all scoped to the active
 * organization so switching orgs refetches everything.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth';

function useOrgId(): string | null {
  return useAuthStore((s) => s.currentOrgId);
}

function orgQuery<T>(key: string, fn: (orgId: string) => Promise<T>, enabled = true) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [key, orgId],
    queryFn: () => fn(orgId!),
    enabled: enabled && orgId !== null,
  });
}

export const useOrgProducts = () => orgQuery('org-products', (o) => api.listOrgProducts(o));
export const useLicenses = () => orgQuery('licenses', (o) => api.listLicenses(o));
export const useWebsites = () => orgQuery('websites', (o) => api.listWebsites(o));
export const useSubscriptions = () => orgQuery('subscriptions', (o) => api.listSubscriptions(o));
export const useInvoices = () => orgQuery('invoices', (o) => api.listInvoices(o));
export const useMembers = () => orgQuery('members', (o) => api.listMembers(o));
export const useInvitations = () => orgQuery('invitations', (o) => api.listInvitations(o));
export const useCreditBalance = () => orgQuery('credit-balance', (o) => api.getCreditBalance(o));
export const useCreditLedger = () => orgQuery('credit-ledger', (o) => api.listCreditLedger(o));
export const useNotifications = () => orgQuery('notifications', (o) => api.listNotifications(o));
export const useTickets = () => orgQuery('tickets', (o) => api.listTickets(o));
export const useSessions = () =>
  useQuery({ queryKey: ['sessions'], queryFn: () => api.listSessions() });
export const useApiKeys = () => orgQuery('api-keys', (o) => api.listApiKeys(o));
export const useCatalog = () =>
  useQuery({ queryKey: ['products'], queryFn: () => api.listProducts(), staleTime: 300_000 });

/** Mutation helper that invalidates the given query keys on success. */
export function useOrgMutation<TInput, TResult>(
  invalidate: string[],
  fn: (orgId: string, input: TInput) => Promise<TResult>
) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => {
      if (!orgId) throw new Error('No organization selected');
      return fn(orgId, input);
    },
    onSuccess: () => {
      for (const key of invalidate) void queryClient.invalidateQueries({ queryKey: [key, orgId] });
    },
  });
}
