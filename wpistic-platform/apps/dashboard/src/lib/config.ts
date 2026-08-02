import type { AuthConfig } from '@wpistic/auth-sdk';

export const API_URL = import.meta.env.VITE_API_URL ?? 'https://api.wpistic.com';
export const ACCOUNT_URL = import.meta.env.VITE_ACCOUNT_URL ?? 'https://account.wpistic.com';

export const authConfig: AuthConfig = {
  accountUrl: ACCOUNT_URL,
  clientId: 'wpistic_dashboard',
  redirectUri: `${window.location.origin}/auth/callback`,
  scope: 'openid profile email org',
};
