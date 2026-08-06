/**
 * @wpistic/platform-sdk — typed client for api.wpistic.com.
 *
 * One implementation shared by app.wpistic.com and product apps so every
 * consumer gets the same auth handling, org context, correlation ids,
 * refresh-on-401, and structured errors.
 */
import type {
  ApiErrorBody,
  CreditBalance,
  EntitlementResolution,
  InvoiceView,
  LicenseView,
  MemberView,
  NotificationView,
  OrganizationView,
  OrgRole,
  PlanView,
  ProductView,
  SubscriptionView,
  TokenResponse,
  UserView,
  WebsiteView,
} from '@wpistic/types';

export interface PlatformClientOptions {
  /** e.g. https://api.wpistic.com */
  baseUrl: string;
  /** Return the current access token, or null when signed out. */
  getAccessToken: () => string | null;
  /** Return the active organization id (sent as X-Organization-Id). */
  getOrganizationId?: () => string | null;
  /**
   * Called on 401 — attempt a token refresh and return the new access token,
   * or null to give up (the client then throws PlatformApiError 'unauthorized').
   */
  onUnauthorized?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export class PlatformApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public correlationId?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'PlatformApiError';
  }
}

export class PlatformClient {
  private base: string;

  constructor(private options: PlatformClientOptions) {
    this.base = options.baseUrl.replace(/\/$/, '') + '/api/v1';
  }

  async request<T>(endpoint: string, init: RequestInit = {}, retried = false): Promise<T> {
    const doFetch = this.options.fetchImpl ?? fetch;
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (!headers.has('X-Correlation-Id')) headers.set('X-Correlation-Id', crypto.randomUUID());

    const token = this.options.getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const orgId = this.options.getOrganizationId?.();
    if (orgId) headers.set('X-Organization-Id', orgId);

    const res = await doFetch(`${this.base}${endpoint}`, { ...init, headers });

    if (res.status === 401 && !retried && this.options.onUnauthorized) {
      const newToken = await this.options.onUnauthorized();
      if (newToken) return this.request<T>(endpoint, init, true);
    }

    if (res.status === 204) return undefined as T;

    const body = (await res.json().catch(() => null)) as (ApiErrorBody & Record<string, unknown>) | null;
    if (!res.ok) {
      const err = body?.error;
      throw new PlatformApiError(
        err?.code ?? (res.status === 401 ? 'unauthorized' : 'request_failed'),
        err?.message ?? `Request failed with status ${res.status}`,
        res.status,
        err?.correlation_id,
        err?.details
      );
    }
    return body as T;
  }

  // ---- identity -----------------------------------------------------------
  me() {
    return this.request<{ user: UserView; organizations: OrganizationView[] }>(`/me`);
  }
  updateMe(data: { first_name?: string; last_name?: string; avatar_url?: string | null }) {
    return this.request<{ user: UserView }>(`/me`, { method: 'PATCH', body: JSON.stringify(data) });
  }
  switchOrg(organizationId: string) {
    return this.request<Pick<TokenResponse, 'access_token' | 'expires_in' | 'token_type'>>(`/auth/switch-org`, {
      method: 'POST',
      body: JSON.stringify({ organization_id: organizationId }),
    });
  }

  // ---- organizations ------------------------------------------------------
  listOrganizations() {
    return this.request<{ organizations: OrganizationView[] }>(`/organizations`);
  }
  createOrganization(data: { name: string; slug?: string }) {
    return this.request<{ organization: OrganizationView }>(`/organizations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  getOrganization(orgId: string) {
    return this.request<{ organization: OrganizationView }>(`/organizations/${orgId}`);
  }
  updateOrganization(orgId: string, data: Record<string, unknown>) {
    return this.request<{ organization: OrganizationView }>(`/organizations/${orgId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
  listMembers(orgId: string) {
    return this.request<{ members: MemberView[] }>(`/organizations/${orgId}/members`);
  }
  updateMember(orgId: string, membershipId: string, data: { role: OrgRole }) {
    return this.request<{ member: MemberView }>(`/organizations/${orgId}/members/${membershipId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
  removeMember(orgId: string, membershipId: string) {
    return this.request<void>(`/organizations/${orgId}/members/${membershipId}`, { method: 'DELETE' });
  }
  listInvitations(orgId: string) {
    return this.request<{ invitations: Array<{ id: string; email: string; role: OrgRole; expires_at: string }> }>(
      `/organizations/${orgId}/invitations`
    );
  }
  invite(orgId: string, data: { email: string; role: OrgRole }) {
    return this.request<{ invitation: { id: string; email: string } }>(`/organizations/${orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  revokeInvitation(orgId: string, invitationId: string) {
    return this.request<void>(`/organizations/${orgId}/invitations/${invitationId}`, { method: 'DELETE' });
  }

  // ---- catalog & entitlements --------------------------------------------
  listProducts() {
    return this.request<{ products: ProductView[] }>(`/products`);
  }
  getProduct(slug: string) {
    return this.request<{ product: ProductView; plans: PlanView[] }>(`/products/${slug}`);
  }
  listOrgProducts(orgId: string) {
    return this.request<{
      products: Array<ProductView & { plan: string | null; status: string; source: 'subscription' | 'license' | 'access_grant' | null }>;
    }>(`/organizations/${orgId}/products`);
  }
  /**
   * Claim a free product. For plugin products the response carries a freshly
   * minted `license` whose `license_key` is returned **exactly once** — store
   * or show it immediately, because only its hash is kept server-side. A
   * repeated claim is idempotent: `repeated` is true, `license` is null, and
   * `existing_license` identifies the key already held (by mask only).
   */
  claimFreeProduct(orgId: string, slug: string, limit_overrides: Record<string, unknown> = {}) {
    return this.request<{
      claim: { id: string; product: string; limits: Record<string, unknown>; status: string; created_at: string };
      repeated: boolean;
      license: { license_id: string; license_key: string; key_mask: string } | null;
      existing_license: { id: string; key_mask: string } | null;
    }>(`/organizations/${orgId}/products/${encodeURIComponent(slug)}/claim`, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ limit_overrides }),
    });
  }
  getEntitlements(orgId: string, product?: string) {
    const qs = product ? `?product=${encodeURIComponent(product)}` : '';
    return this.request<EntitlementResolution>(`/organizations/${orgId}/entitlements${qs}`);
  }

  // ---- licenses -----------------------------------------------------------
  listLicenses(orgId: string) {
    return this.request<{ licenses: LicenseView[] }>(`/organizations/${orgId}/licenses`);
  }
  getLicense(orgId: string, licenseId: string) {
    return this.request<{
      license: LicenseView;
      activations: Array<{
        id: string;
        domain_normalized: string;
        environment: string;
        status: string;
        last_seen_at: string | null;
      }>;
    }>(`/organizations/${orgId}/licenses/${licenseId}`);
  }
  rotateLicense(orgId: string, licenseId: string) {
    return this.request<{ license: LicenseView; key: string }>(`/organizations/${orgId}/licenses/${licenseId}/rotate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }
  deactivateActivation(orgId: string, licenseId: string, activationId: string) {
    return this.request<void>(`/organizations/${orgId}/licenses/${licenseId}/activations/${activationId}`, {
      method: 'DELETE',
    });
  }

  // ---- websites -----------------------------------------------------------
  listWebsites(orgId: string) {
    return this.request<{ websites: WebsiteView[] }>(`/organizations/${orgId}/websites`);
  }
  addWebsite(orgId: string, data: { domain: string; name?: string; environment?: string }) {
    return this.request<{ website: WebsiteView; connection_token: string }>(`/organizations/${orgId}/websites`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  disconnectWebsite(orgId: string, websiteId: string) {
    return this.request<void>(`/organizations/${orgId}/websites/${websiteId}`, { method: 'DELETE' });
  }

  // ---- billing ------------------------------------------------------------
  listSubscriptions(orgId: string) {
    return this.request<{ subscriptions: SubscriptionView[] }>(`/organizations/${orgId}/subscriptions`);
  }
  listInvoices(orgId: string) {
    return this.request<{ invoices: InvoiceView[] }>(`/organizations/${orgId}/invoices`);
  }
  createCheckout(orgId: string, data: { price_id: string; quantity?: number; coupon_code?: string }) {
    return this.request<{ checkout_url: string }>(`/organizations/${orgId}/billing/checkout`, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(data),
    });
  }
  createBillingPortal(orgId: string) {
    return this.request<{ portal_url: string }>(`/organizations/${orgId}/billing/portal`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }
  cancelSubscription(orgId: string, subscriptionId: string) {
    return this.request<{ subscription: SubscriptionView }>(
      `/organizations/${orgId}/subscriptions/${subscriptionId}/cancel`,
      { method: 'POST', body: JSON.stringify({}) }
    );
  }

  // ---- AI credits ---------------------------------------------------------
  getCreditBalance(orgId: string) {
    return this.request<CreditBalance>(`/organizations/${orgId}/ai-credits/balance`);
  }
  listCreditLedger(orgId: string, limit = 50) {
    return this.request<{
      entries: Array<{
        id: string;
        entry_type: string;
        amount: number;
        balance_after: number;
        description: string | null;
        created_at: string;
      }>;
    }>(`/organizations/${orgId}/ai-credits/ledger?limit=${limit}`);
  }

  // ---- notifications ------------------------------------------------------
  listNotifications(orgId: string, unreadOnly = false) {
    return this.request<{ notifications: NotificationView[] }>(
      `/organizations/${orgId}/notifications${unreadOnly ? '?unread=1' : ''}`
    );
  }
  markNotificationRead(orgId: string, id: string) {
    return this.request<void>(`/organizations/${orgId}/notifications/${id}/read`, { method: 'POST' });
  }

  // ---- support ------------------------------------------------------------
  listTickets(orgId: string) {
    return this.request<{
      tickets: Array<{ id: string; subject: string; status: string; severity: string; created_at: string }>;
    }>(`/organizations/${orgId}/support`);
  }
  createTicket(orgId: string, data: { subject: string; body: string; product?: string; severity?: string }) {
    return this.request<{ ticket: { id: string } }>(`/organizations/${orgId}/support`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ---- security -----------------------------------------------------------
  listSessions() {
    return this.request<{
      sessions: Array<{
        id: string;
        ip_address: string | null;
        user_agent: string | null;
        created_at: string;
        current: boolean;
      }>;
    }>(`/me/sessions`);
  }
  revokeSession(sessionId: string) {
    return this.request<void>(`/me/sessions/${sessionId}`, { method: 'DELETE' });
  }
  revokeOtherSessions() {
    return this.request<{ revoked: number }>(`/me/sessions/revoke-others`, { method: 'POST' });
  }
  listApiKeys(orgId: string) {
    return this.request<{
      keys: Array<{ id: string; name: string; key_mask: string; scopes: string[]; last_used_at: string | null }>;
    }>(`/organizations/${orgId}/api-keys`);
  }
  createApiKey(orgId: string, data: { name: string; scopes?: string[] }) {
    return this.request<{ key: string; id: string }>(`/organizations/${orgId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  revokeApiKey(orgId: string, keyId: string) {
    return this.request<void>(`/organizations/${orgId}/api-keys/${keyId}`, { method: 'DELETE' });
  }
}
