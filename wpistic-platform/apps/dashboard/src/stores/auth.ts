/**
 * Auth + organization context. Access tokens live in memory only; the
 * rotating refresh token is persisted by @wpistic/auth-sdk (sessionStorage)
 * and exchanged on boot. Org switching swaps the access token for one with
 * the new org_id claim.
 */
import { create } from 'zustand';
import { clearStoredAuth, decodeJwtPayload, logout as sdkLogout, refreshTokens, startLogin } from '@wpistic/auth-sdk';
import type { AccessTokenClaims, OrganizationView, UserView } from '@wpistic/types';
import { authConfig } from '../lib/config';

export type AuthStatus = 'booting' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: UserView | null;
  organizations: OrganizationView[];
  currentOrgId: string | null;
  impersonation: boolean;

  setTokens: (accessToken: string) => void;
  setIdentity: (user: UserView, organizations: OrganizationView[]) => void;
  setCurrentOrg: (orgId: string, accessToken?: string) => void;
  setUnauthenticated: () => void;
  boot: () => Promise<void>;
  refresh: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const ORG_KEY = 'wpistic.current_org';

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'booting',
  accessToken: null,
  user: null,
  organizations: [],
  currentOrgId: null,
  impersonation: false,

  setTokens: (accessToken) => {
    const claims = decodeJwtPayload<AccessTokenClaims>(accessToken);
    set({
      accessToken,
      status: 'authenticated',
      impersonation: claims?.imp === true,
      currentOrgId: get().currentOrgId ?? claims?.org_id ?? null,
    });
  },

  setIdentity: (user, organizations) => {
    const stored = localStorage.getItem(ORG_KEY);
    const current = get().currentOrgId ?? stored;
    const valid = organizations.some((o) => o.id === current) ? current : (organizations[0]?.id ?? null);
    set({ user, organizations, currentOrgId: valid });
    if (valid) localStorage.setItem(ORG_KEY, valid);
  },

  setCurrentOrg: (orgId, accessToken) => {
    localStorage.setItem(ORG_KEY, orgId);
    set({ currentOrgId: orgId, ...(accessToken ? { accessToken } : {}) });
  },

  setUnauthenticated: () => set({ status: 'unauthenticated', accessToken: null, user: null }),

  boot: async () => {
    const tokens = await refreshTokens(authConfig);
    if (tokens) {
      get().setTokens(tokens.access_token);
    } else {
      set({ status: 'unauthenticated' });
    }
  },

  refresh: async () => {
    const tokens = await refreshTokens(authConfig);
    if (!tokens) {
      get().setUnauthenticated();
      return null;
    }
    get().setTokens(tokens.access_token);
    return tokens.access_token;
  },

  signOut: async () => {
    await sdkLogout(authConfig, get().accessToken);
    clearStoredAuth(authConfig);
    localStorage.removeItem(ORG_KEY);
    set({ status: 'unauthenticated', accessToken: null, user: null, organizations: [], currentOrgId: null });
  },
}));

/** Kick off the branded login flow, preserving the intended destination. */
export function redirectToLogin(returnTo?: string): void {
  void startLogin(authConfig, { returnTo: returnTo ?? window.location.pathname + window.location.search });
}
