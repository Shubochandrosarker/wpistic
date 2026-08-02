/**
 * Organization API keys (`wpk_` prefix) for server-to-server access.
 * The raw key is returned exactly once; only its SHA-256 hash is stored.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppContext } from '../../env';
import { blockImpersonation, requireRole } from '../../middleware/tenant';
import { randomHex, sha256Hex } from '../../utils/crypto';

export const apiKeyRoutes = new Hono<AppContext>();

apiKeyRoutes.get('/', async (c) => {
  const { orgId } = requireRole(c, ['admin']);
  const keys = await c.get('sql')`
    SELECT id, name, key_mask, scopes, last_used_at, expires_at, created_at
    FROM api_keys
    WHERE organization_id = ${orgId} AND revoked_at IS NULL
    ORDER BY created_at DESC`;
  return c.json({ keys });
});

apiKeyRoutes.post(
  '/',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).max(100),
      scopes: z.array(z.string().max(50)).max(20).default([]),
      expires_in_days: z.number().int().min(1).max(365).optional(),
    })
  ),
  async (c) => {
    const { orgId } = requireRole(c, ['admin']);
    blockImpersonation(c);
    const user = c.get('user')!;
    const body = c.req.valid('json');

    const rawKey = `wpk_${randomHex(32)}`;
    const mask = `wpk_****${rawKey.slice(-4)}`;
    const expiresAt = body.expires_in_days ? new Date(Date.now() + body.expires_in_days * 86400 * 1000) : null;

    const rows = await c.get('sql')<{ id: string }[]>`
      INSERT INTO api_keys (organization_id, user_id, name, key_hash, key_mask, scopes, expires_at)
      VALUES (${orgId}, ${user.id}, ${body.name}, ${await sha256Hex(rawKey)}, ${mask},
              ${c.get('sql').json(body.scopes as never)}, ${expiresAt})
      RETURNING id`;

    return c.json({ id: rows[0]!.id, key: rawKey, key_mask: mask }, 201);
  }
);

apiKeyRoutes.delete('/:keyId', async (c) => {
  const { orgId } = requireRole(c, ['admin']);
  blockImpersonation(c);
  await c.get('sql')`
    UPDATE api_keys SET revoked_at = NOW()
    WHERE id = ${c.req.param('keyId')} AND organization_id = ${orgId} AND revoked_at IS NULL`;
  return c.body(null, 204);
});
