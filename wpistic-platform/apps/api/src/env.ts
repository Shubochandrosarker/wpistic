import type { Sql } from 'postgres';
import type { OrgRole } from '@wpistic/types';
import type { EventBus } from './events/bus';

export interface Env {
  ENVIRONMENT: 'staging' | 'production';
  HYPERDRIVE: Hyperdrive;
  RATE_LIMIT: KVNamespace;
  /** Optional Cloudflare native rate-limit binding for distributed edge enforcement. */
  RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  SESSION_CACHE: KVNamespace;
  EVENT_BUS: Queue;
  UPDATE_PACKAGES: R2Bucket;
  ASSETS: R2Bucket;
  ACCOUNT_SERVICE_URL: string;
  DASHBOARD_URL: string;
  PUBLIC_API_URL: string;
  PUBLIC_ACCOUNT_URL: string;
  PUBLIC_DASHBOARD_URL: string;
  PUBLIC_ADMIN_URL: string;
  BILLING_MODE?: BillingMode;
  STRIPE_PUBLISHABLE_KEY?: string;
  /** Comma-separated allowlist of platform staff emails for admin JWT access. */
  ADMIN_EMAILS: string;
  /** Optional server-side mapping: email=role,email=role. Browser headers are ignored. */
  ADMIN_ROLES?: string;
  /** Local CI/staging automation only. Never configure this in production. */
  ADMIN_API_TOKEN?: string;
  ALLOW_LEGACY_ADMIN_TOKEN?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  LICENSE_SIGNING_SECRET: string;
  /** RS256 keypair for license activation tokens — distinct audience from JWT_PRIVATE_KEY (dashboard access tokens). */
  LICENSE_JWT_PRIVATE_KEY: string;
  LICENSE_JWT_PUBLIC_KEY: string;
  JWT_PUBLIC_KEY: string;
  JWT_PRIVATE_KEY: string;
  /** Same AES key the account service uses — needed to verify admin MFA on impersonation. */
  MFA_ENC_KEY: string;
}

export type BillingMode = 'FREE_ONLY' | 'STRIPE_TEST' | 'STRIPE_LIVE';

export function billingMode(env: Pick<Env, 'BILLING_MODE'>): BillingMode {
  const mode = env.BILLING_MODE ?? 'FREE_ONLY';
  if (mode === 'STRIPE_TEST' || mode === 'STRIPE_LIVE') return mode;
  return 'FREE_ONLY';
}

export type AuthKind = 'jwt' | 'api_key' | 'admin_token';

export interface AuthUser {
  id: string;
  email: string;
}

export type Variables = {
  sql: Sql;
  events: EventBus;
  correlationId: string;
  /** Present after jwtAuth for authenticated principals. */
  user?: AuthUser;
  authKind?: AuthKind;
  /** org_id claim from the token (or api key's org). */
  tokenOrgId?: string | null;
  /** Resolved org for the request after tenant middleware. */
  orgId?: string;
  orgRole?: OrgRole;
  scopes?: string[];
  impersonation?: { admin: string };
  adminRole?: string;
  /** Session id (sid claim) from the access token, when present. */
  sessionId?: string;
  /** Audience of the verified access token — reused when re-signing on org switch. */
  tokenAudience?: string;
};

export type AppContext = { Bindings: Env; Variables: Variables };

export const LICENSE_CHECK_AFTER_SECONDS = 43200; // 12 hours
export const LICENSE_GRACE_PERIOD_DAYS = 7;
export const ACTIVATION_TOKEN_TTL_DAYS = 30;
export const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;
