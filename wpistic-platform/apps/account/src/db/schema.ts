/**
 * Auth-service data access: users, sessions, oauth clients, authorization
 * codes, password resets, MFA recovery codes, security events.
 * All queries are parameterized via the postgres tagged-template driver.
 */
import type { Sql } from 'postgres';
import type { OrgRole } from '@wpistic/types';

export interface UserRow {
  id: string;
  email: string;
  email_verified_at: string | null;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  mfa_secret: string | null;
  mfa_enabled: boolean;
  status: string;
  login_count: number;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  role: OrgRole;
}

export interface OAuthClientRow {
  id: string;
  client_id: string;
  client_secret_hash: string | null;
  name: string;
  redirect_uris: string[];
  allowed_scopes: string[];
  is_confidential: boolean;
  metadata: Record<string, unknown>;
}

export interface SessionRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  expires_at: string;
  refresh_expires_at: string | null;
  revoked_at: string | null;
}

export async function findUserByEmail(sql: Sql, email: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, email, email_verified_at, password_hash, first_name, last_name,
           avatar_url, mfa_secret, mfa_enabled, status, login_count
    FROM users WHERE email = ${email.toLowerCase()} AND status <> 'deleted' LIMIT 1`;
  return rows[0] ?? null;
}

export async function findUserById(sql: Sql, id: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, email, email_verified_at, password_hash, first_name, last_name,
           avatar_url, mfa_secret, mfa_enabled, status, login_count
    FROM users WHERE id = ${id} AND status <> 'deleted' LIMIT 1`;
  return rows[0] ?? null;
}

export async function listUserOrganizations(sql: Sql, userId: string): Promise<OrgSummary[]> {
  return sql<OrgSummary[]>`
    SELECT o.id, o.name, o.slug, o.avatar_url, m.role
    FROM organization_memberships m
    JOIN organizations o ON o.id = m.organization_id
    WHERE m.user_id = ${userId} AND m.status = 'active' AND o.status = 'active'
    ORDER BY m.created_at ASC`;
}

export async function isMemberOfOrg(sql: Sql, userId: string, orgId: string): Promise<OrgRole | null> {
  const rows = await sql<{ role: OrgRole }[]>`
    SELECT role FROM organization_memberships
    WHERE user_id = ${userId} AND organization_id = ${orgId} AND status = 'active' LIMIT 1`;
  return rows[0]?.role ?? null;
}

export async function findOAuthClient(sql: Sql, clientId: string): Promise<OAuthClientRow | null> {
  const rows = await sql<OAuthClientRow[]>`
    SELECT id, client_id, client_secret_hash, name, redirect_uris, allowed_scopes, is_confidential, metadata
    FROM oauth_clients WHERE client_id = ${clientId} LIMIT 1`;
  return rows[0] ?? null;
}

export interface CreateSessionInput {
  userId: string;
  organizationId: string | null;
  tokenHash: string;
  refreshTokenHash: string | null;
  expiresAt: Date;
  refreshExpiresAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
}

export async function createSession(sql: Sql, input: CreateSessionInput): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO sessions (user_id, organization_id, token_hash, refresh_token_hash,
                          expires_at, refresh_expires_at, ip_address, user_agent, device_fingerprint)
    VALUES (${input.userId}, ${input.organizationId}, ${input.tokenHash}, ${input.refreshTokenHash},
            ${input.expiresAt}, ${input.refreshExpiresAt}, ${input.ipAddress}, ${input.userAgent},
            ${input.deviceFingerprint})
    RETURNING id`;
  return rows[0]!.id;
}

export async function findSessionByTokenHash(sql: Sql, tokenHash: string): Promise<SessionRow | null> {
  const rows = await sql<SessionRow[]>`
    SELECT id, user_id, organization_id, expires_at, refresh_expires_at, revoked_at
    FROM sessions
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > NOW()
    LIMIT 1`;
  return rows[0] ?? null;
}

export async function findSessionByRefreshHash(sql: Sql, refreshHash: string): Promise<SessionRow | null> {
  const rows = await sql<SessionRow[]>`
    SELECT id, user_id, organization_id, expires_at, refresh_expires_at, revoked_at
    FROM sessions
    WHERE refresh_token_hash = ${refreshHash} AND revoked_at IS NULL
      AND refresh_expires_at IS NOT NULL AND refresh_expires_at > NOW()
    LIMIT 1`;
  return rows[0] ?? null;
}

/** Refresh rotation: replace the refresh hash, extend the session lifetime. */
export async function rotateRefreshToken(
  sql: Sql,
  sessionId: string,
  newRefreshHash: string,
  refreshExpiresAt: Date,
  sessionExpiresAt: Date
): Promise<void> {
  await sql`
    UPDATE sessions
    SET refresh_token_hash = ${newRefreshHash},
        refresh_expires_at = ${refreshExpiresAt},
        expires_at = GREATEST(expires_at, ${sessionExpiresAt})
    WHERE id = ${sessionId}`;
}

export async function revokeSession(sql: Sql, sessionId: string, userId: string): Promise<void> {
  await sql`UPDATE sessions SET revoked_at = NOW() WHERE id = ${sessionId} AND user_id = ${userId} AND revoked_at IS NULL`;
}

export async function revokeOtherSessions(sql: Sql, userId: string, keepSessionId: string): Promise<number> {
  const rows = await sql`
    UPDATE sessions SET revoked_at = NOW()
    WHERE user_id = ${userId} AND id <> ${keepSessionId} AND revoked_at IS NULL
    RETURNING id`;
  return rows.length;
}

export async function revokeAllSessions(sql: Sql, userId: string): Promise<void> {
  await sql`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
}

export async function recordSecurityEvent(
  sql: Sql,
  input: {
    userId: string | null;
    organizationId?: string | null;
    eventType: string;
    severity?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await sql`
    INSERT INTO security_events (user_id, organization_id, event_type, severity, ip_address, user_agent, metadata)
    VALUES (${input.userId}, ${input.organizationId ?? null}, ${input.eventType}, ${input.severity ?? 'info'},
            ${input.ipAddress ?? null}, ${input.userAgent ?? null}, ${sql.json(input.metadata ?? {})})`;
}

export async function touchLogin(sql: Sql, userId: string): Promise<void> {
  await sql`UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = ${userId}`;
}
