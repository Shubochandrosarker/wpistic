import { PlatformClient } from '@wpistic/platform-sdk';
import { API_URL } from './config';
import { useAuthStore } from '../stores/auth';

export const api = new PlatformClient({
  baseUrl: API_URL,
  getAccessToken: () => useAuthStore.getState().accessToken,
  getOrganizationId: () => useAuthStore.getState().currentOrgId,
  onUnauthorized: () => useAuthStore.getState().refresh(),
});
