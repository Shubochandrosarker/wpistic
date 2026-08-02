/**
 * Identity module: current user profile, sessions, memberships, invitations.
 */
import type { Sql } from 'postgres';
import type { OrgRole } from '@wpistic/types';
import { ApiError } from '../../errors';
import { randomHex, sha256Hex } from '../../utils/crypto';
import type { EventBus } from '../../events/bus';

export class IdentityService {
  constructor(
    private sql: Sql,
    private events: EventBus
  ) {}

  async getMe(userId: string) {
    const users = await this.sql`
      SELECT id, email, first_name, last_name, avatar_url, mfa_enabled,
             (email_verified_at IS NOT NULL) AS email_verified, created_at
      FROM users WHERE id = ${userId} LIMIT 1`;
    if (!users[0]) throw ApiError.notFound('User');

    const organizations = await this.sql`
      SELECT o.id, o.name, o.slug, o.avatar_url, o.billing_email, o.status, m.role, o.created_at
      FROM organization_memberships m
      JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = ${userId} AND m.status = 'active' AND o.status = 'active'
      ORDER BY m.created_at ASC`;

    return { user: users[0], organizations };
  }

  async updateMe(userId: string, data: { first_name?: string; last_name?: string; avatar_url?: string | null }) {
    const users = await this.sql`
      UPDATE users
      SET first_name = COALESCE(${data.first_name ?? null}, first_name),
          last_name = COALESCE(${data.last_name ?? null}, last_name),
          avatar_url = ${data.avatar_url === undefined ? this.sql`avatar_url` : data.avatar_url}
      WHERE id = ${userId}
      RETURNING id, email, first_name, last_name, avatar_url, mfa_enabled,
                (email_verified_at IS NOT NULL) AS email_verified, created_at`;
    if (!users[0]) throw ApiError.notFound('User');
    return { user: users[0] };
  }

  // ---- sessions (shared table with the account service) -------------------

  async listSessions(userId: string, currentSessionId: string | null) {
    const rows = await this.sql`
      SELECT id, ip_address::text AS ip_address, user_agent, created_at
      FROM sessions
      WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 50`;
    return rows.map((r) => ({ ...r, current: r.id === currentSessionId }));
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.sql`
      UPDATE sessions SET revoked_at = NOW()
      WHERE id = ${sessionId} AND user_id = ${userId} AND revoked_at IS NULL`;
  }

  async revokeOtherSessions(userId: string, keepSessionId: string | null): Promise<number> {
    const rows = await this.sql`
      UPDATE sessions SET revoked_at = NOW()
      WHERE user_id = ${userId} AND revoked_at IS NULL
        AND (${keepSessionId}::uuid IS NULL OR id <> ${keepSessionId}::uuid)
      RETURNING id`;
    return rows.length;
  }

  // ---- members ------------------------------------------------------------

  async listMembers(orgId: string) {
    return this.sql`
      SELECT m.id, m.user_id, u.email, u.first_name, u.last_name, u.avatar_url,
             m.role, m.status, m.joined_at
      FROM organization_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ${orgId}
      ORDER BY m.created_at ASC`;
  }

  async updateMemberRole(orgId: string, membershipId: string, role: OrgRole) {
    const rows = await this.sql<{ id: string; role: OrgRole }[]>`
      SELECT id, role FROM organization_memberships
      WHERE id = ${membershipId} AND organization_id = ${orgId} LIMIT 1`;
    const membership = rows[0];
    if (!membership) throw ApiError.notFound('Member');
    if (membership.role === 'owner') {
      throw ApiError.forbidden('Ownership is changed via transfer, not role edits');
    }

    const updated = await this.sql`
      UPDATE organization_memberships SET role = ${role}
      WHERE id = ${membershipId}
      RETURNING id, user_id, role, status, joined_at`;
    return updated[0];
  }

  async removeMember(orgId: string, membershipId: string, actorUserId: string) {
    const rows = await this.sql<{ id: string; user_id: string; role: OrgRole }[]>`
      SELECT id, user_id, role FROM organization_memberships
      WHERE id = ${membershipId} AND organization_id = ${orgId} LIMIT 1`;
    const membership = rows[0];
    if (!membership) throw ApiError.notFound('Member');
    if (membership.role === 'owner') throw ApiError.forbidden('The owner cannot be removed');
    if (membership.user_id === actorUserId) {
      throw ApiError.badRequest('cannot_remove_self', 'Use "Leave organization" to remove yourself');
    }
    await this.sql`DELETE FROM organization_memberships WHERE id = ${membershipId}`;
  }

  // ---- invitations --------------------------------------------------------

  async listInvitations(orgId: string) {
    return this.sql`
      SELECT id, email, role, expires_at, created_at
      FROM organization_invitations
      WHERE organization_id = ${orgId} AND accepted_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC`;
  }

  async createInvitation(orgId: string, email: string, role: OrgRole, invitedBy: string) {
    const normalizedEmail = email.toLowerCase();

    const existingMember = await this.sql`
      SELECT 1 FROM organization_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ${orgId} AND u.email = ${normalizedEmail} AND m.status = 'active'
      LIMIT 1`;
    if (existingMember.length > 0) {
      throw ApiError.conflict('already_member', 'This person is already a member of the organization');
    }

    const token = randomHex(32);
    const rows = await this.sql<{ id: string }[]>`
      INSERT INTO organization_invitations (organization_id, email, role, token_hash, expires_at, invited_by)
      VALUES (${orgId}, ${normalizedEmail}, ${role}, ${await sha256Hex(token)}, NOW() + INTERVAL '7 days', ${invitedBy})
      RETURNING id`;

    await this.events.publish('organization.member.invited', { org_id: orgId, email: normalizedEmail, role });
    // The raw token is returned once so the caller (or an email relay) can
    // build the invite link: {DASHBOARD_URL}/invitations/accept?token=...
    return { id: rows[0]!.id, email: normalizedEmail, role, token };
  }

  async revokeInvitation(orgId: string, invitationId: string) {
    await this.sql`
      DELETE FROM organization_invitations
      WHERE id = ${invitationId} AND organization_id = ${orgId} AND accepted_at IS NULL`;
  }

  async acceptInvitation(userId: string, userEmail: string, token: string) {
    const rows = await this.sql<
      Array<{ id: string; organization_id: string; email: string; role: OrgRole }>
    >`
      SELECT id, organization_id, email, role
      FROM organization_invitations
      WHERE token_hash = ${await sha256Hex(token)} AND accepted_at IS NULL AND expires_at > NOW()
      LIMIT 1`;
    const invitation = rows[0];
    if (!invitation) throw ApiError.badRequest('invalid_invitation', 'Invitation is invalid or expired');
    if (invitation.email !== userEmail.toLowerCase()) {
      throw ApiError.forbidden('This invitation was sent to a different email address');
    }

    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO organization_memberships (user_id, organization_id, role, invited_by)
        SELECT ${userId}, ${invitation.organization_id}, ${invitation.role}, invited_by
        FROM organization_invitations WHERE id = ${invitation.id}
        ON CONFLICT (user_id, organization_id)
        DO UPDATE SET status = 'active', role = ${invitation.role}`;
      await tx`UPDATE organization_invitations SET accepted_at = NOW() WHERE id = ${invitation.id}`;
    });

    return { organization_id: invitation.organization_id, role: invitation.role };
  }
}
