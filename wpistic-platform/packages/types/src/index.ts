/**
 * @wpistic/types — shared Zod schemas and TypeScript types.
 *
 * Single source of truth for the shapes that cross service boundaries:
 * API request/response bodies, domain events, entitlement maps, and the
 * entity views the dashboard/admin/product apps consume.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Roles & shared enums
// ---------------------------------------------------------------------------

export const ORG_ROLES = [
  'owner',
  'admin',
  'billing_manager',
  'product_manager',
  'support_manager',
  'member',
  'viewer',
] as const;
export const orgRoleSchema = z.enum(ORG_ROLES);
export type OrgRole = z.infer<typeof orgRoleSchema>;

/** Roles allowed to manage billing actions. */
export const BILLING_ROLES: readonly OrgRole[] = ['owner', 'admin', 'billing_manager'];
/** Roles allowed to manage members. */
export const MEMBER_ADMIN_ROLES: readonly OrgRole[] = ['owner', 'admin'];

export const environmentSchema = z.enum(['production', 'staging', 'development', 'local']);
export type SiteEnvironment = z.infer<typeof environmentSchema>;

export const subscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'grace_period',
  'paused',
  'cancelled',
  'expired',
  'refunded',
  'lifetime',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** Subscription statuses that still confer entitlements. */
export const ENTITLED_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'active',
  'trialing',
  'past_due',
  'grace_period',
  'lifetime',
];

export const licenseStatusSchema = z.enum(['active', 'suspended', 'expired', 'revoked', 'transferred']);
export type LicenseStatus = z.infer<typeof licenseStatusSchema>;

export const updateChannelSchema = z.enum(['stable', 'beta', 'early_access', 'internal', 'hotfix']);
export type UpdateChannel = z.infer<typeof updateChannelSchema>;

// ---------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------

/** Flat entitlement map, e.g. { "chatbotistic.agents.max": 5, "seoistic.pro.enabled": true } */
export type EntitlementValue = boolean | number | string | string[];
export type EntitlementMap = Record<string, EntitlementValue>;

export interface EntitlementResolution {
  entitlements: EntitlementMap;
  /** Where each entitlement came from (subscription/license ids), newest wins. */
  sources: Array<{ type: 'subscription' | 'license'; id: string; product: string; plan: string }>;
  /** Monotonic version — bump on every recalculation so caches can compare. */
  version: number;
  resolved_at: string;
}

// ---------------------------------------------------------------------------
// Auth service contracts
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(10).max(128),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100).optional(),
  organization_name: z.string().min(2).max(255).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
  mfa_code: z.string().min(6).max(10).optional(),
  remember_me: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const tokenRequestSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string().min(10),
    redirect_uri: z.string().url(),
    client_id: z.string().min(1),
    code_verifier: z.string().min(43).max(128),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string().min(10),
    client_id: z.string().min(1),
  }),
]);
export type TokenRequest = z.infer<typeof tokenRequestSchema>;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface AccessTokenClaims {
  sub: string;
  email: string;
  org_id: string | null;
  org_role?: OrgRole;
  scope: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  /** Present and true when this token was minted through admin impersonation. */
  imp?: boolean;
  imp_admin?: string;
}

export const passwordResetRequestSchema = z.object({ email: z.string().email() });
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(10).max(128),
});
export const mfaVerifySchema = z.object({ code: z.string().min(6).max(10) });

// ---------------------------------------------------------------------------
// Organization / identity contracts
// ---------------------------------------------------------------------------

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/)
    .optional(),
  billing_email: z.string().email().optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  billing_email: z.string().email().nullable().optional(),
  billing_address: z.record(z.unknown()).nullable().optional(),
  tax_id: z.string().max(50).nullable().optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: orgRoleSchema.exclude(['owner']),
});

export const updateMemberSchema = z.object({
  role: orgRoleSchema.exclude(['owner']),
});

export const acceptInvitationSchema = z.object({ token: z.string().min(10) });

export const switchOrgSchema = z.object({ organization_id: z.string().uuid() });

// ---------------------------------------------------------------------------
// License contracts (WordPress Plugin SDK API)
// ---------------------------------------------------------------------------

export const activateLicenseSchema = z.object({
  key: z.string().min(12).max(120),
  domain: z.string().min(1).max(255),
  installation_uuid: z.string().uuid(),
  site_url: z.string().url().optional(),
  home_url: z.string().url().optional(),
  environment: environmentSchema.default('production'),
  product_version: z.string().max(50).optional(),
  wp_version: z.string().max(50).optional(),
  php_version: z.string().max(20).optional(),
});
export type ActivateLicenseInput = z.infer<typeof activateLicenseSchema>;

export const validateLicenseSchema = z.object({
  activation_token: z.string().min(10),
});

export const deactivateLicenseSchema = z.object({
  activation_token: z.string().min(10),
  installation_uuid: z.string().uuid(),
});

export const refreshLicenseSchema = z.object({
  activation_token: z.string().min(10),
});

export interface LicenseValidationResponse {
  valid: boolean;
  status: LicenseStatus | 'not_found' | 'activation_revoked';
  product: string;
  plan: string;
  expires_at: string | null;
  activation: {
    id: string;
    domain: string;
    environment: SiteEnvironment;
  } | null;
  entitlements: EntitlementMap;
  updates: { channel: UpdateChannel; allowed: boolean };
  /** Seconds until the plugin should re-validate (12h). */
  check_after: number;
  /** Days the plugin may keep premium features alive if the API is unreachable. */
  grace_period_days: number;
  /** base64 HMAC-SHA256 over the canonical JSON of this payload minus `signature`. */
  signature: string;
}

export interface LicenseActivationResponse extends LicenseValidationResponse {
  activation_token: string;
  /**
   * Per-license verification key (HMAC(master, license_id)) used by the plugin
   * to verify response signatures offline without holding the master secret.
   */
  verification_key: string;
}

export const rotateLicenseSchema = z.object({ reason: z.string().max(500).optional() });

// ---------------------------------------------------------------------------
// Website registry contracts
// ---------------------------------------------------------------------------

export const connectWebsiteSchema = z.object({
  domain: z.string().min(1).max(255),
  product: z.string().min(1).max(50),
  product_version: z.string().max(50).optional(),
  wp_version: z.string().max(50).optional(),
  php_version: z.string().max(20).optional(),
  environment: environmentSchema.default('production'),
  name: z.string().max(255).optional(),
});

export const heartbeatSchema = z.object({
  connection_token: z.string().min(10),
  wp_version: z.string().max(50).optional(),
  php_version: z.string().max(20).optional(),
  products: z
    .array(
      z.object({
        slug: z.string(),
        version: z.string().optional(),
      })
    )
    .optional(),
  health: z.enum(['healthy', 'warning', 'critical']).optional(),
});

export const addWebsiteSchema = z.object({
  domain: z.string().min(1).max(255),
  name: z.string().max(255).optional(),
  environment: environmentSchema.default('production'),
});

// ---------------------------------------------------------------------------
// AI credits / usage contracts
// ---------------------------------------------------------------------------

export const usageEventSchema = z.object({
  organization_id: z.string().uuid().optional(),
  product: z.string().min(1).max(50),
  operation: z.string().min(1).max(100),
  units: z.number().int().positive().max(100000).default(1),
  idempotency_key: z.string().min(8).max(255),
  metadata: z.record(z.unknown()).optional(),
});
export type UsageEventInput = z.infer<typeof usageEventSchema>;

export interface CreditBalance {
  organization_id: string;
  balance: number;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Billing contracts
// ---------------------------------------------------------------------------

export const checkoutSchema = z.object({
  price_id: z.string().uuid(),
  quantity: z.number().int().positive().max(1000).default(1),
  coupon_code: z.string().max(50).optional(),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

// ---------------------------------------------------------------------------
// Support / notifications contracts
// ---------------------------------------------------------------------------

export const createTicketSchema = z.object({
  subject: z.string().min(3).max(255),
  body: z.string().min(1).max(20000),
  product: z.string().max(50).optional(),
  website_id: z.string().uuid().optional(),
  license_id: z.string().uuid().optional(),
  severity: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  category: z.string().max(50).optional(),
  environment_details: z.record(z.unknown()).optional(),
});

export const ticketMessageSchema = z.object({
  body: z.string().min(1).max(20000),
});

export const notificationPreferenceSchema = z.object({
  channel: z.enum(['in_app', 'email', 'push', 'sms']),
  category: z.string().min(1).max(50),
  enabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Admin contracts
// ---------------------------------------------------------------------------

export const impersonateSchema = z.object({
  organization_id: z.string().uuid(),
  reason: z.string().min(10).max(500),
  mfa_code: z.string().min(6).max(10),
});

export const adminLicenseActionSchema = z.object({
  action: z.enum(['suspend', 'reactivate', 'revoke', 'reset_activations']),
  reason: z.string().min(3).max(500),
});

// ---------------------------------------------------------------------------
// Domain events (Cloudflare Queues payloads)
// ---------------------------------------------------------------------------

export type DomainEvent =
  | { type: 'user.registered'; data: { user_id: string; email: string } }
  | { type: 'organization.created'; data: { org_id: string; name: string; owner_id: string } }
  | { type: 'organization.member.invited'; data: { org_id: string; email: string; role: OrgRole } }
  | { type: 'subscription.activated'; data: { org_id: string; subscription_id: string; plan_ids: string[] } }
  | { type: 'subscription.past_due'; data: { org_id: string; subscription_id: string; grace_period_end: string } }
  | { type: 'subscription.cancelled'; data: { org_id: string; subscription_id: string } }
  | { type: 'entitlements.changed'; data: { org_id: string; product_id: string | null; version: number } }
  | { type: 'license.issued'; data: { license_id: string; org_id: string; product_id: string } }
  | { type: 'license.activated'; data: { license_id: string; org_id: string; domain: string } }
  | { type: 'license.deactivated'; data: { license_id: string; org_id: string } }
  | { type: 'license.expired'; data: { license_id: string; org_id: string } }
  | { type: 'website.connected'; data: { website_id: string; org_id: string; domain: string } }
  | { type: 'ai_credits.consumed'; data: { org_id: string; product: string; units: number; balance_after: number } }
  | { type: 'support.ticket.created'; data: { ticket_id: string; org_id: string; severity: string } }
  | { type: 'product.update.published'; data: { product_id: string; version: string; channel: UpdateChannel } };

export type DomainEventType = DomainEvent['type'];

/** Envelope actually placed on the queue / delivered to webhook subscribers. */
export interface EventEnvelope {
  id: string;
  type: DomainEventType;
  occurred_at: string;
  correlation_id: string | null;
  data: Extract<DomainEvent, { type: DomainEventType }>['data'];
}

// ---------------------------------------------------------------------------
// API entity views (what list/detail endpoints return)
// ---------------------------------------------------------------------------

export interface UserView {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  mfa_enabled: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface OrganizationView {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  billing_email: string | null;
  status: string;
  role?: OrgRole;
  created_at: string;
}

export interface MemberView {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: OrgRole;
  status: string;
  joined_at: string;
}

export interface ProductView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  app_url: string | null;
  marketing_url: string | null;
  type: 'saas' | 'plugin' | 'bundle' | 'addon';
  status: string;
}

export interface PlanView {
  id: string;
  product_id: string;
  slug: string;
  name: string;
  description: string | null;
  prices: Array<{
    id: string;
    amount: number;
    currency: string;
    interval: 'month' | 'year' | 'lifetime' | null;
    trial_days: number;
    is_default: boolean;
  }>;
}

export interface LicenseView {
  id: string;
  product: string;
  product_name: string;
  plan: string;
  key_mask: string;
  status: LicenseStatus;
  max_activations: number;
  active_activations: number;
  expires_at: string | null;
  created_at: string;
}

export interface WebsiteView {
  id: string;
  domain: string;
  name: string | null;
  environment: SiteEnvironment;
  is_connected: boolean;
  health_status: string;
  wp_version: string | null;
  php_version: string | null;
  last_sync_at: string | null;
  installations: Array<{ product: string; product_name: string; version: string | null; license_id: string | null }>;
}

export interface SubscriptionView {
  id: string;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  items: Array<{ product: string; product_name: string; plan: string; plan_name: string; quantity: number }>;
}

export interface InvoiceView {
  id: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  pdf_url: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface NotificationView {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface UpdateMetadataResponse {
  has_update: boolean;
  version?: string;
  requires_php?: string | null;
  requires_wp?: string | null;
  changelog_url?: string | null;
  download_url?: string | null;
  package_hash?: string | null;
  package_size?: number | null;
  is_security_release?: boolean;
  tested_up_to?: string | null;
}

/** Standard structured error envelope returned by every API error path. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    correlation_id?: string;
    details?: unknown;
  };
}
