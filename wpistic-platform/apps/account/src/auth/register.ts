/**
 * Registration: creates the user, their first organization (org-first
 * tenancy — every commercial entity belongs to an org), and an owner
 * membership, then establishes a browser session.
 */
import type { Context } from 'hono';
import type { RegisterInput } from '@wpistic/types';
import type { AppContext } from '../env';
import { hashPassword } from '../utils/crypto';
import { establishSession, getClientIp } from './sessions';
import { recordSecurityEvent, type UserRow } from '../db/schema';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'org'
  );
}

export async function handleRegister(c: Context<AppContext>, input: RegisterInput) {
  const sql = c.get('sql');
  const email = input.email.toLowerCase();

  const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.length > 0) {
    return c.json({ error: { code: 'email_taken', message: 'An account with this email already exists' } }, 409);
  }

  const passwordHash = await hashPassword(input.password);
  const orgName = input.organization_name?.trim() || `${input.first_name}'s Workspace`;
  const baseSlug = slugify(orgName);

  const { user, orgId } = await sql.begin(async (tx) => {
    const users = await tx<UserRow[]>`
      INSERT INTO users (email, password_hash, first_name, last_name)
      VALUES (${email}, ${passwordHash}, ${input.first_name}, ${input.last_name ?? null})
      RETURNING id, email, email_verified_at, password_hash, first_name, last_name,
                avatar_url, mfa_secret, mfa_enabled, status, login_count`;
    const user = users[0]!;

    // Suffix the slug on collision; two attempts then fall back to a random tail.
    let slug = baseSlug;
    for (let attempt = 0; ; attempt++) {
      const taken = await tx`SELECT 1 FROM organizations WHERE slug = ${slug} LIMIT 1`;
      if (taken.length === 0) break;
      slug = attempt < 2 ? `${baseSlug}-${attempt + 2}` : `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
    }

    const orgs = await tx<{ id: string }[]>`
      INSERT INTO organizations (name, slug, billing_email)
      VALUES (${orgName}, ${slug}, ${email})
      RETURNING id`;
    const orgId = orgs[0]!.id;

    await tx`
      INSERT INTO organization_memberships (user_id, organization_id, role)
      VALUES (${user.id}, ${orgId}, 'owner')`;

    return { user, orgId };
  });

  await recordSecurityEvent(sql, {
    userId: user.id,
    organizationId: orgId,
    eventType: 'user.registered',
    ipAddress: getClientIp(c),
    userAgent: c.req.header('User-Agent') ?? null,
  });

  await establishSession(c, user, orgId);

  return c.json(
    {
      user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name },
      organization: { id: orgId, name: orgName },
    },
    201
  );
}
