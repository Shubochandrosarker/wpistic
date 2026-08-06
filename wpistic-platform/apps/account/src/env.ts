import type { Sql } from 'postgres';

export interface Env {
  HYPERDRIVE: Hyperdrive;
  PKCE_STORAGE: KVNamespace;
  ENVIRONMENT: 'staging' | 'production';
  ISSUER: string;
  COOKIE_DOMAIN: string;
  DEFAULT_REDIRECT: string;
  JWT_PRIVATE_KEY: string;
  JWT_PUBLIC_KEY: string;
  MFA_ENC_KEY: string;
  EMAIL_WEBHOOK_URL: string;
}

export interface SessionContext {
  sessionId: string;
  userId: string;
  organizationId: string | null;
}

export type Variables = {
  sql: Sql;
  session?: SessionContext;
};

export type AppContext = { Bindings: Env; Variables: Variables };

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const REFRESH_TOKEN_REMEMBER_DAYS = 90;
export const SESSION_TTL_HOURS = 24;
export const AUTH_CODE_TTL_SECONDS = 300;
export const SESSION_COOKIE = 'wpistic_session';
