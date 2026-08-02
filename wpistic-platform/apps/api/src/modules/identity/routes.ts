import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import { acceptInvitationSchema, inviteMemberSchema, updateMemberSchema } from '@wpistic/types';
import type { AppContext } from '../../env';
import { ApiError } from '../../errors';
import { requireOrg, requireRole } from '../../middleware/tenant';
import { IdentityService } from './service';

function svc(c: Context<AppContext>): IdentityService {
  return new IdentityService(c.get('sql'), c.get('events'));
}

function currentUser(c: Context<AppContext>) {
  const user = c.get('user');
  if (!user) throw ApiError.unauthorized();
  return user;
}

// ---------------------------------------------------------------------------
// /api/v1/me
// ---------------------------------------------------------------------------

export const meRoutes = new Hono<AppContext>();

meRoutes.get('/', async (c) => c.json(await svc(c).getMe(currentUser(c).id)));

meRoutes.patch(
  '/',
  zValidator(
    'json',
    z.object({
      first_name: z.string().min(1).max(100).optional(),
      last_name: z.string().min(1).max(100).optional(),
      avatar_url: z.string().url().nullable().optional(),
    })
  ),
  async (c) => c.json(await svc(c).updateMe(currentUser(c).id, c.req.valid('json')))
);

meRoutes.get('/sessions', async (c) =>
  c.json({ sessions: await svc(c).listSessions(currentUser(c).id, c.get('sessionId') ?? null) })
);

meRoutes.delete('/sessions/:sessionId', async (c) => {
  await svc(c).revokeSession(currentUser(c).id, c.req.param('sessionId'));
  return c.body(null, 204);
});

meRoutes.post('/sessions/revoke-others', async (c) => {
  const revoked = await svc(c).revokeOtherSessions(currentUser(c).id, c.get('sessionId') ?? null);
  return c.json({ revoked });
});

// ---------------------------------------------------------------------------
// /api/v1/organizations/:orgId/members
// ---------------------------------------------------------------------------

export const memberRoutes = new Hono<AppContext>();

memberRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  return c.json({ members: await svc(c).listMembers(orgId) });
});

memberRoutes.patch('/:membershipId', zValidator('json', updateMemberSchema), async (c) => {
  const { orgId } = requireRole(c, ['admin']);
  const member = await svc(c).updateMemberRole(orgId, c.req.param('membershipId'), c.req.valid('json').role);
  return c.json({ member });
});

memberRoutes.delete('/:membershipId', async (c) => {
  const { orgId } = requireRole(c, ['admin']);
  await svc(c).removeMember(orgId, c.req.param('membershipId'), currentUser(c).id);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// /api/v1/organizations/:orgId/invitations  +  /api/v1/invitations/accept
// ---------------------------------------------------------------------------

export const invitationRoutes = new Hono<AppContext>();

invitationRoutes.get('/', async (c) => {
  const { orgId } = requireRole(c, ['admin']);
  return c.json({ invitations: await svc(c).listInvitations(orgId) });
});

invitationRoutes.post('/', zValidator('json', inviteMemberSchema), async (c) => {
  const { orgId } = requireRole(c, ['admin']);
  const body = c.req.valid('json');
  const invitation = await svc(c).createInvitation(orgId, body.email, body.role, currentUser(c).id);
  const inviteUrl = `${c.env.DASHBOARD_URL}/invitations/accept?token=${invitation.token}`;
  return c.json({ invitation: { id: invitation.id, email: invitation.email, role: invitation.role }, invite_url: inviteUrl }, 201);
});

invitationRoutes.delete('/:invitationId', async (c) => {
  const { orgId } = requireRole(c, ['admin']);
  await svc(c).revokeInvitation(orgId, c.req.param('invitationId'));
  return c.body(null, 204);
});

export const invitationAcceptRoute = new Hono<AppContext>().post(
  '/accept',
  zValidator('json', acceptInvitationSchema),
  async (c) => {
    const user = currentUser(c);
    const result = await svc(c).acceptInvitation(user.id, user.email, c.req.valid('json').token);
    return c.json(result);
  }
);
